import { ipcMain } from 'electron'
import axios from 'axios'
import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// Default backend URL – overridden by the ``backendUrl`` setting at runtime.
// The backend URL is configurable so that the frontend can connect to a
// backend running on a different machine entirely.
let VIDEORAG_API_BASE_URL = 'http://localhost:64451/api'

// Import form-data once at module level for multipart uploads
// (form-data is available as a transitive dependency of axios)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormData = require('form-data')

// Update API base URL from a full backend origin (no /api path) or a full /api URL
function updateAPIBaseURL(newUrl: string) {
  // Strip trailing /api if present, then re-append to ensure consistent format
  const base = newUrl.replace(/\/api(\/.*)?$/, '').replace(/\/$/, '')
  VIDEORAG_API_BASE_URL = `${base}/api`
  console.log(`📡 Updated API base URL to: ${VIDEORAG_API_BASE_URL}`)
}

// Python backend process management
let pythonProcess: ChildProcess | null = null

// Port configuration – used only when scanning for a locally-launched backend.
// When connecting to a remote backend, the full URL is set via the ``backendUrl``
// setting and port scanning is skipped.
const PORT_RANGE_START = 64451
const PORT_RANGE_END = 64470

// Efficiently scan port range to find VideoRAG service on localhost
async function scanForVideoRAGService(startPort?: number, endPort?: number): Promise<number | null> {
  const start = startPort || PORT_RANGE_START
  const end = endPort || PORT_RANGE_END
  
  console.log(`🔍 Scanning for VideoRAG service on ports ${start}-${end}...`)
  
  for (let port = start; port <= end; port++) {
    try {
      const isHealthy = await attemptHealthCheck(port)
      if (isHealthy) {
        console.log(`🎯 Found healthy VideoRAG service on port ${port}`)
        return port
      }
    } catch (error) {
      // Continue checking next port
      continue
    }
  }
  
  console.log(`❌ No VideoRAG service found in port range ${start}-${end}`)
  return null
}

// Start Python backend service
export function startVideoRAGService(): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if we're in development environment
      const isDev = process.env.NODE_ENV === 'development'
      
      // Prevent multiple resolve/reject
      let resolved = false
      const safeResolve = (value: boolean) => {
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }
      const safeReject = (error: Error) => {
        if (!resolved) {
          resolved = true
          reject(error)
        }
      }

      if (isDev) {
        // Development mode: skip starting backend, but still scan for existing service
        console.log('🚀 Development mode detected - skipping backend service startup')
        console.log('💡 In development, scanning for manually started Python backend...')
      } else {
        // Production mode: start the packaged executable
        console.log('🚀 Production mode - starting packaged backend service')
        
        // Determine executable path for production
        const executableName = process.platform === 'win32' ? 'videorag_api.exe' : 'videorag_api'
        const executablePath = path.join(process.resourcesPath, 'python_backend', 'dist', 'videorag_api', executableName)
        
        // Check if executable exists
        if (!fs.existsSync(executablePath)) {
          console.error(`❌ Packaged executable not found at: ${executablePath}`)
          safeReject(new Error(`VideoRAG executable not found at: ${executablePath}`))
          return
        }

        console.log(`✅ Found packaged executable: ${executablePath}`)

        // Start packaged executable
        try {
          console.log(`🚀 Starting VideoRAG service with packaged executable: ${executablePath}`)
          
          pythonProcess = spawn(executablePath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.dirname(executablePath),
            env: { ...process.env },
          })
          
          pythonProcess.stdout?.on('data', (data) => {
            const output = data.toString()
            console.log(`VideoRAG API: ${output}`)
          })

          pythonProcess.stderr?.on('data', (data) => {
            const errorStr = data.toString()
            console.error(`VideoRAG API Error: ${errorStr}`)
          })
          
          console.log(`✅ Successfully started packaged executable`)
          
        } catch (error) {
          console.error(`❌ Failed to start packaged executable:`, error)
          safeReject(new Error(`Failed to start packaged executable: ${error}`))
          return
        }

        if (!pythonProcess) {
          safeReject(new Error('Failed to start packaged executable. Please ensure the executable was built correctly.'))
          return
        }

        pythonProcess.on('close', (code) => {
          console.log(`VideoRAG API process exited with code ${code}`)
          pythonProcess = null
          if (!resolved) {
            safeReject(new Error(`VideoRAG process exited with code ${code}`))
          }
        })

        pythonProcess.on('error', (error) => {
          console.error(`Python process error:`, error)
          if (!resolved) {
            safeReject(error)
          }
        })
      }

      // Smart timeout handling - continuous scanning
      setTimeout(async () => {
        if (!resolved) {
          console.log('⏳ Initial timeout reached, starting continuous service detection...')
          
          let scanAttempts = 0
          const maxScanAttempts = 1000000 // Maximum scan attempts
          const scanInterval = 3000 // Scan every 3 seconds
          
          const continuousScan = async () => {
            scanAttempts++
            console.log(`🔍 Scanning attempt ${scanAttempts}/${maxScanAttempts}...`)
            
            const foundPort = await scanForVideoRAGService(PORT_RANGE_START, PORT_RANGE_END)
            if (foundPort) {
              console.log(`✅ Found service on port ${foundPort} after ${scanAttempts} attempts!`)
              updateAPIBaseURL(`http://localhost:${foundPort}`)
              initializeVideoRAGConfig()
                .then(() => safeResolve(true))
                .catch(() => {
                  console.error('Configuration initialization failed, but service is running')
                  safeResolve(true) // Service started, even if configuration fails
                })
              return
            }
            
            // If not reached maximum attempts, continue scanning
            if (scanAttempts < maxScanAttempts) {
              console.log(`❌ Service not found, retrying in ${scanInterval/1000} seconds... (${scanAttempts}/${maxScanAttempts})`)
              setTimeout(continuousScan, scanInterval)
            } else {
              console.error(`❌ Failed to locate VideoRAG service after ${maxScanAttempts} scan attempts`)
              safeReject(new Error(`Failed to locate VideoRAG service after ${maxScanAttempts} scan attempts over ${(maxScanAttempts * scanInterval / 1000)} seconds`))
            }
          }
          
          // Start first scan
          continuousScan()
        }
      }, 10000) // Start scanning after 10 seconds

    } catch (error) {
      reject(error)
    }
  })
}

// Stop Python backend service
export function stopVideoRAGService() {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill()
    pythonProcess = null
  }
}

// API call helper function - supports asynchronous operations
async function callVideoRAGAPI(endpoint: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', data?: any, customTimeout?: number) {
  // Set different timeouts for different operations
  let timeout = customTimeout || 30000; // Default 30 seconds
  
  // Asynchronous operation: return quickly, do not wait for completion
  if (endpoint.includes('/upload')) {
    timeout = customTimeout || 60000; // Video upload operation: 60 seconds
  } else if (endpoint.includes('/initialize')) {
    timeout = customTimeout || 120000; // Initialization still needs to wait: 2 minutes
  } else if (endpoint.includes('/status')) {
    timeout = customTimeout || 10000;  // Status query: 10 seconds
  } else if (endpoint.includes('/imagebind/load') || endpoint.includes('/imagebind/release')) {
    timeout = customTimeout || 180000; // ImageBind model load/release: 3 minutes
  } else if (endpoint.includes('/imagebind/status')) {
    timeout = customTimeout || 10000;  // ImageBind status query: 10 seconds
  }
  
  try {
    console.log(`📡 API call: ${method} ${endpoint} (timeout: ${timeout}ms)`)
    const response = await axios({
      method,
      url: `${VIDEORAG_API_BASE_URL}${endpoint}`,
      data,
      timeout
    })
    return response.data
  } catch (error: any) {
    console.error(`VideoRAG API call failed:`, error)
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Request timeout after ${timeout}ms. The operation might need more time to complete.`)
    }
    throw new Error(error.response?.data?.error || error.message || 'API call failed')
  }
}

// Initialize VideoRAG configuration – sends only non-path settings to backend.
// The backend manages its own storage paths via environment variables.
async function initializeVideoRAGConfig(): Promise<void> {
  try {
    console.log('🔧 Loading VideoRAG configuration...')
    
    // 1. Load settings
    const settingsResult = await loadSettingsFromFile()
    if (!settingsResult.success) {
      throw new Error('Failed to load settings')
    }
    
    const settings = settingsResult.settings
    console.log('🔧 Loaded settings:', {
      ...settings,
      openaiApiKey: settings.openaiApiKey ? '***' : 'NOT_SET',
      dashscopeApiKey: settings.dashscopeApiKey ? '***' : 'NOT_SET'
    })

    // 2. Apply backend URL from settings (supports remote backends)
    if (settings.backendUrl) {
      updateAPIBaseURL(settings.backendUrl)
    }
    
    // 3. Build VideoRAG configuration – API keys and model names ONLY.
    //    Storage paths are intentionally omitted: the backend owns them via
    //    env vars (VIDEORAG_STORE_DIR, IMAGEBIND_MODEL_PATH) and will reject
    //    any frontend-supplied paths.
    const videoragConfig = {
      ali_dashscope_api_key: settings.dashscopeApiKey,
      openai_api_key: settings.openaiApiKey,
      ali_dashscope_base_url: settings.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      openai_base_url: settings.openaiBaseUrl || 'https://api.openai.com/v1',
      analysisModel: settings.analysisModel || 'gpt-4o-mini',
      processingModel: settings.processingModel || 'gpt-4o-mini',
      embeddingModel: settings.embeddingModel || 'text-embedding-3-small',
      caption_model: settings.captionModel || 'qwen-vl-plus-latest',
      asr_model: settings.asrModel || 'large-v3'
    }
    
    console.log('🔧 VideoRAG configuration (keys redacted):', {
      ...videoragConfig,
      ali_dashscope_api_key: videoragConfig.ali_dashscope_api_key ? '✅ SET' : '❌ MISSING',
      openai_api_key: videoragConfig.openai_api_key ? '✅ SET' : '❌ MISSING',
    })
    
    // 4. Validate required API key fields
    const missingFields: string[] = []
    if (!videoragConfig.ali_dashscope_api_key || videoragConfig.ali_dashscope_api_key.trim() === '') {
      missingFields.push('Ali Dashscope API Key (dashscopeApiKey)')
    }
    if (!videoragConfig.openai_api_key || videoragConfig.openai_api_key.trim() === '') {
      missingFields.push('OpenAI API Key (openaiApiKey)')
    }
    
    if (missingFields.length > 0) {
      const errorMessage = `❌ VideoRAG configuration validation failed!\n\nMissing required fields:\n${missingFields.map(field => `  • ${field}`).join('\n')}\n\nPlease configure these settings.`
      console.error(errorMessage)
      console.log('🛑 Stopping VideoRAG service due to configuration errors...')
      stopVideoRAGService()
      throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`)
    }
    
    // 5. Call VideoRAG API for initialization
    const result = await callVideoRAGAPI('/initialize', 'POST', videoragConfig)
    
    if (result.success) {
      console.log('✅ VideoRAG global configuration set successfully!')
    } else {
      console.error('❌ VideoRAG API initialization failed:', result.error)
      console.log('🛑 Stopping VideoRAG service due to API initialization failure...')
      stopVideoRAGService()
      throw new Error(`VideoRAG initialization failed: ${result.error}`)
    }
    
  } catch (error) {
    console.error('❌ VideoRAG configuration initialization failed:', error)
    throw error
  }
}

// Load settings from file
async function loadSettingsFromFile(): Promise<{ success: boolean; settings?: any; error?: string }> {
  try {
    const { readFile, access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { homedir } = await import('node:os')
    
    const BOOTSTRAP_CONFIG_FILE = join(homedir(), '.videorag-bootstrap.json')
    
    let settings: any = {
      openaiBaseUrl: 'https://api.openai.com/v1',
      dashscopeBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      processingModel: 'gpt-4o-mini',
      analysisModel: 'gpt-4o-mini',
      openaiApiKey: '',
      dashscopeApiKey: '',
      storeDirectory: '',
      // Configurable backend URL (default: localhost)
      backendUrl: 'http://localhost:64451',
    }

    // Try to load bootstrap configuration
    try {
      await access(BOOTSTRAP_CONFIG_FILE)
      const bootstrapContent = await readFile(BOOTSTRAP_CONFIG_FILE, 'utf-8')
      const bootstrap = JSON.parse(bootstrapContent)
      settings = { ...settings, ...bootstrap }
      console.log('📁 Loaded bootstrap config:', Object.keys(bootstrap))
    } catch (error) {
      console.log('📁 Bootstrap config not found, using defaults')
    }

    // Try to load main configuration file
    if (settings.storeDirectory) {
      try {
        const mainConfigPath = join(settings.storeDirectory, 'config.json')
        await access(mainConfigPath)
        const mainContent = await readFile(mainConfigPath, 'utf-8')
        const mainSettings = JSON.parse(mainContent)
        settings = { ...settings, ...mainSettings }
        console.log('📁 Loaded main config from:', mainConfigPath)
      } catch (error) {
        console.log('📁 Main config not found, using bootstrap + defaults')
      }
    }

    return { success: true, settings }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// IPC handlers setup
export function setupVideoRAGHandlers() {
  
  // Manually start service
  ipcMain.handle('videorag:start-service', async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development'
      
      // Production mode: check if already running first
      if (!isDev && pythonProcess && !pythonProcess.killed) {
        return { success: true, message: 'Service is already running' }
      }
      
      // Both dev and production: start service (dev will skip actual startup but scan for existing)
      const result = await startVideoRAGService()
      
      if (isDev) {
        return { 
          success: result, 
          message: result 
            ? 'Found manually started backend service' 
            : 'No backend service found - please start it manually'
        }
      } else {
        return { 
          success: result, 
          message: result ? 'Service started successfully' : 'Failed to start service' 
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Manually stop service
  ipcMain.handle('videorag:stop-service', async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development'
      
      if (isDev) {
        // Development mode: return mock response
        return { 
          success: true, 
          message: 'Development mode - backend service not managed by Electron'
        }
      }
      
      // Production mode: actually stop the service
      stopVideoRAGService()
      return { success: true, message: 'Service stopped successfully' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get service status
  ipcMain.handle('videorag:service-status', async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development'
      
      if (isDev) {
        // Development mode: return mock status
        return { 
          success: true, 
          isRunning: false, 
          pythonProcess: 'development_mode',
          message: 'Development mode - backend service not managed by Electron'
        }
      }
      
      // Production mode: check actual process status
      const isRunning = pythonProcess && !pythonProcess.killed
      return { success: true, isRunning, pythonProcess: isRunning ? 'running' : 'stopped' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  
  // Check API health status
  ipcMain.handle('videorag:health-check', async () => {
    try {
      const result = await callVideoRAGAPI('/health')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Set global configuration
  ipcMain.handle('videorag:initialize', async (_, config) => {
    try {
      const result = await callVideoRAGAPI('/initialize', 'POST', config)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })



  // Upload video for a session and start indexing.
  // Files are streamed to the backend via multipart/form-data so that the
  // frontend never needs to tell the backend where its own filesystem is.
  // The ``baseStoragePath`` parameter is intentionally dropped; the backend
  // now determines storage location from its own environment variables.
  ipcMain.handle('videorag:upload-video', async (_, chatId: string, videoPathList: string[]) => {
    try {
      const form = new FormData()

      for (const videoPath of videoPathList) {
        form.append('videos', fs.createReadStream(videoPath), {
          filename: path.basename(videoPath),
        })
      }

      const response = await axios.post(
        `${VIDEORAG_API_BASE_URL}/sessions/${chatId}/videos/upload`,
        form,
        {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 3600000, // 1 hour for large video files
        }
      )
      return { success: true, data: response.data }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || error.message || 'Upload failed' }
    }
  })

  // Get indexing status for specific session
  ipcMain.handle('videorag:get-status', async (_, chatId: string, type?: string) => {
    try {
      const url = type ? `/sessions/${chatId}/status?type=${type}` : `/sessions/${chatId}/status`
      const result = await callVideoRAGAPI(url)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get list of indexed videos for specific session
  ipcMain.handle('videorag:list-indexed', async (_, chatId: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/videos/indexed`)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get status for specific session
  ipcMain.handle('videorag:session-status', async (_, chatId: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/status`)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Query video content for specific session (to be implemented)
  ipcMain.handle('videorag:query', async (_, chatId: string, query: string, mode: string = 'videorag') => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/query`, 'POST', { query, mode })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // New: start query processing
  ipcMain.handle('videorag:query-video', async (_, chatId: string, query: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/query`, 'POST', { query })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get system status
  ipcMain.handle('videorag:system-status', async () => {
    try {
      const result = await callVideoRAGAPI('/system/status')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get video duration.
  // Sends the video file to the backend via multipart upload so that the
  // backend does not need access to the frontend's filesystem.
  ipcMain.handle('videorag:get-video-duration', async (_, videoPath: string) => {
    try {
      console.log(`📄 Getting video duration for: ${videoPath}`)
      const form = new FormData()
      form.append('video', fs.createReadStream(videoPath), {
        filename: path.basename(videoPath),
      })
      const response = await axios.post(
        `${VIDEORAG_API_BASE_URL}/video/duration`,
        form,
        {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 60000,
        }
      )
      return { success: true, ...response.data }
    } catch (error: any) {
      console.error(`❌ Failed to get video duration for ${videoPath}:`, error.message)
      return { success: false, error: error.message }
    }
  })

  // New: handler to get localStorage configuration from renderer process
  ipcMain.handle('videorag:get-localStorage-config', async () => {
    try {
      // This handler will be called by the renderer process, to get the configuration from localStorage
      // Actual localStorage reading needs to be done in the renderer process
      return { success: true, message: 'This handler should be called from renderer' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // New: manually reinitialize configuration
  ipcMain.handle('videorag:reinitialize-config', async () => {
    try {
      await initializeVideoRAGConfig()
      return { success: true, message: 'Configuration reinitialized successfully' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Delete specific session and its resources
  ipcMain.handle('videorag:delete-session', async (_, chatId: string) => {
    try {
      const result = await callVideoRAGAPI(`/sessions/${chatId}/delete`, 'DELETE')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Load ImageBind model
  ipcMain.handle('videorag:load-imagebind', async () => {
    try {
      const result = await callVideoRAGAPI('/imagebind/load', 'POST')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Release ImageBind model
  ipcMain.handle('videorag:release-imagebind', async () => {
    try {
      const result = await callVideoRAGAPI('/imagebind/release', 'POST')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get ImageBind status
  ipcMain.handle('videorag:imagebind-status', async () => {
    try {
      const result = await callVideoRAGAPI('/imagebind/status', 'GET')
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Application restart
  ipcMain.handle('app:restart', async () => {
    try {
      const { app } = await import('electron')
      app.relaunch()
      app.exit(0)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Clean configuration file
  ipcMain.handle('app:clear-config', async () => {
    try {
      const { unlink } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const { homedir } = await import('node:os')
      
      const BOOTSTRAP_CONFIG_FILE = join(homedir(), '.videorag-bootstrap.json')
      
      try {
        await unlink(BOOTSTRAP_CONFIG_FILE)
        console.log('Bootstrap config file deleted successfully')
      } catch (error) {
        console.log('Bootstrap config file not found or already deleted')
      }
      
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

// Single health check attempt
async function attemptHealthCheck(port: number): Promise<boolean> {
  try {
    const response = await axios({
      method: 'GET',
      url: `http://localhost:${port}/api/health`,
      timeout: 5000,
      validateStatus: (status) => status === 200
    })
    
    // Validate response content
    if (response.data && response.data.status === 'ok') {
      console.log(`✅ Health check successful on port ${port}:`, response.data)
      return true
    } else {
      console.log(`⚠️ Unexpected health check response:`, response.data)
      return false
    }
    
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`🔍 Port ${port} not ready yet (connection refused)`)
    } else if (error.code === 'ECONNRESET') {
      console.log(`🔍 Port ${port} connection reset, service might be starting`)
    } else {
      console.log(`🔍 Health check failed on port ${port}:`, error.message)
    }
    return false
  }
} 