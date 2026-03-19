import { useState, useEffect } from 'react'
import { X, Settings, CheckCircle, AlertCircle, Play, Square, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { useVideoRAG, VideoRAGConfig } from '../hooks/useVideoRAG'
import { useVideoRAGService } from '../hooks/useVideoRAGService'

interface VideoRAGConfigProps {
  isOpen: boolean
  onClose: () => void
}

export const VideoRAGConfigModal = ({ isOpen, onClose }: VideoRAGConfigProps) => {
  const { initialize, loading, error, clearError } = useVideoRAG()
  const { 
    serviceState, 
    loading: serviceLoading, 
    checkServiceStatus, 
    startService, 
    stopService 
  } = useVideoRAGService()
  
  const [config, setConfig] = useState<VideoRAGConfig>({
    processingModel: '',
    analysisModel: '',
    caption_model: '',
    asr_model: '',
  })
  
  // Configuration is considered ready when the backend service is running
  const isConfigured = serviceState.isRunning

  // Load saved config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('videorag-config')
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig))
      } catch (error) {
        console.error('Failed to load saved config:', error)
      }
    }
  }, [])

  const handleConfigChange = (field: keyof VideoRAGConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    // Save config to localStorage
    localStorage.setItem('videorag-config', JSON.stringify(config))
    
    // Initialize VideoRAG with model selections
    const success = await initialize(config)
    if (success) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-xl font-semibold">VideoRAG Configuration</h2>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Service Status */}
          <div className="space-y-4">
            {/* Service Control */}
            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="w-5 h-5" />
                  <span className="font-medium">VideoRAG Service</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={checkServiceStatus}
                    disabled={serviceLoading.checkingService}
                  >
                    {serviceLoading.checkingService ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                  {serviceState.isRunning ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stopService}
                      disabled={serviceLoading.stopping}
                    >
                      {serviceLoading.stopping ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      Stop
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={startService}
                      disabled={serviceLoading.starting}
                    >
                      {serviceLoading.starting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      Start
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2 text-sm">
                {serviceState.isRunning ? (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-600">Service is running</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-yellow-600">Service is stopped</span>
                  </div>
                )}
                {serviceState.message && (
                  <div className="text-xs text-gray-500 mt-1">{serviceState.message}</div>
                )}
                {serviceState.error && (
                  <div className="text-xs text-red-500 mt-1">{serviceState.error}</div>
                )}
              </div>
            </div>

            {/* Configuration Status */}
            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center space-x-2">
                {isConfigured ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
                <span className="font-medium">
                  Configuration: {isConfigured ? 'Complete' : 'Incomplete'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                System configuration (API keys, base URLs, storage) is managed via backend environment variables.
              </p>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-700">{error}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearError}
                    className="mt-2"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Model Selection Section */}
          <div className="space-y-4">
            <h3 className="font-medium">Model Selection</h3>
            <p className="text-sm text-gray-500">
              Choose models for different tasks. Leave blank to use backend defaults.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Processing Model
                </label>
                <input
                  type="text"
                  value={config.processingModel || ''}
                  onChange={(e) => handleConfigChange('processingModel', e.target.value)}
                  placeholder="gpt-4o-mini (default)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Analysis Model
                </label>
                <input
                  type="text"
                  value={config.analysisModel || ''}
                  onChange={(e) => handleConfigChange('analysisModel', e.target.value)}
                  placeholder="gpt-4o-mini (default)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={loading.initializing}
          >
            {loading.initializing ? 'Configuring...' : 'Save & Configure'}
          </Button>
        </div>
      </div>
    </div>
  )
} 