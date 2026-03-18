import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import {
  Download,
  CheckCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Brain,
  Star,
} from 'lucide-react';
import vimoLogo from '../assets/images/vimi-logo.png';

interface InitializationWizardProps {
  onComplete: () => void;
}

const InitializationWizard: React.FC<InitializationWizardProps> = ({ onComplete }) => {
  // Define steps configuration
  const steps = [
    { step: 1, icon: Download, label: 'Models' },
    { step: 2, icon: Star, label: 'Complete' }
  ];
  const totalSteps = steps.length;
  
  const [currentStep, setCurrentStep] = useState(1);
  const [storeDirectory, setStoreDirectory] = useState('');
  const [imagebindStatus, setImagebindStatus] = useState<'pending' | 'downloading' | 'completed' | 'error'>('pending');
  const [downloadProgress, setDownloadProgress] = useState({ imagebind: 0 });
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  

  // Initialize component - fetch storage directory from backend and check models
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        const configResult = await window.api.videorag.getConfig();
        if (configResult.success && configResult.data?.base_storage_path) {
          const directory = configResult.data.base_storage_path;
          setStoreDirectory(directory);
          await checkModelFiles(directory);
        }
      } catch (error) {
        console.error('Failed to initialize component:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeComponent();
  }, []);

  // Listen for download progress events
  useEffect(() => {
    const handleDownloadProgress = (_, data: { type: string, progress: number, downloaded?: number, total?: number }) => {
      console.log('Download progress:', data);
      if (data.type === 'imagebind') {
        setDownloadProgress(prev => ({ ...prev, imagebind: data.progress }));
      }
    };

    // Add event listeners
    window.api.onDownloadProgress(handleDownloadProgress);
    
    // Cleanup function
    return () => {
      window.api.removeDownloadListeners();
    };
  }, []);

  // Check if model files exist
  const checkModelFiles = async (directory?: string) => {
    const targetDirectory = directory || storeDirectory;
    if (!targetDirectory) return { imagebind: false };

    try {
      const result = await window.api.checkModelFiles(targetDirectory);
      console.log('Model check result:', result);
      
      setImagebindStatus(result.imagebind ? 'completed' : 'pending');
      
      // Update progress to 100% for completed models
      if (result.imagebind) {
        setDownloadProgress(prev => ({ ...prev, imagebind: 100 }));
      }
      
      return result;
    } catch (error) {
      console.error('Failed to check model files:', error);
      return { imagebind: false };
    }
  };

  // Download ImageBind model
  const downloadImageBind = async () => {
    if (!storeDirectory) return;
    
    setImagebindStatus('downloading');
    setDownloadProgress(prev => ({ ...prev, imagebind: 0 }));
    
    try {
      console.log('Starting ImageBind download...');
      const result = await window.api.downloadImageBind(storeDirectory);
      
      if (result.success) {
        setImagebindStatus('completed');
        setDownloadProgress(prev => ({ ...prev, imagebind: 100 }));
        console.log('ImageBind download completed successfully');
      } else {
        setImagebindStatus('error');
        alert(`ImageBind download failed: ${result.error}`);
      }
    } catch (error) {
      setImagebindStatus('error');
      console.error('ImageBind download failed:', error);
      alert(`ImageBind download error: ${error}`);
    }
  };

  // Check if can proceed to next step
  const canProceedToStep2 = imagebindStatus === 'completed';

  // Handle step transitions with animation
  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  // Refresh model status
  const refreshModelsStatus = async () => {
    if (!storeDirectory || isRefreshing) return;
    
    setIsRefreshing(true);
    
    try {
      const result = await window.api.checkModelFiles(storeDirectory);
      console.log('Refresh check result:', result);
      
      setImagebindStatus(result.imagebind ? 'completed' : 'pending');
      
      // Update progress for completed models
      if (result.imagebind) {
        setDownloadProgress(prev => ({ ...prev, imagebind: 100 }));
      } else {
        setDownloadProgress(prev => ({ ...prev, imagebind: 0 }));
      }
    } catch (error) {
      console.error('Failed to refresh model status:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Complete initialization
  const completeInitialization = async () => {
    const settings = {
      imagebindInstalled: true,
      initializedAt: new Date().toISOString()
    };
    
    await window.api.saveSettings(settings);
    
    onComplete();
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 z-50 overflow-auto">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking VideoRAG environment...</p>
          </div>
        </div>
      </div>
    );
  }

  const renderModelDownload = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <h2 className="text-2xl font-bold text-gray-900">AI Models Status</h2>
          <Button
            onClick={refreshModelsStatus}
            size="sm"
            variant="outline"
            disabled={isRefreshing}
            className="px-3 py-1 border-gray-300 hover:border-purple-400 hover:bg-purple-50 transition-all disabled:opacity-50"
            title="Refresh model status"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Checking...' : 'Refresh Status'}
          </Button>
        </div>
        <p className="text-gray-600">
          {canProceedToStep2 
            ? "All AI models are already available and ready to use!" 
            : "Preparing powerful AI models for you, this may take a few minutes"
          }
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* ImageBind Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-blue-900">ImageBind</h3>
              <p className="text-sm text-blue-700">Image & Video Understanding</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-white/60 rounded-lg text-sm">
              <span>File Size</span>
              <span className="font-semibold text-blue-700">~4.5GB</span>
            </div>
            
            {imagebindStatus === 'downloading' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{Math.round(downloadProgress.imagebind)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress.imagebind}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              onClick={downloadImageBind}
              disabled={imagebindStatus === 'downloading' || imagebindStatus === 'completed'}
              className={`w-full py-2 font-medium rounded-lg transition-all ${
                imagebindStatus === 'completed' 
                  ? 'bg-green-500 hover:bg-green-600 text-white' 
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white'
              }`}
            >
              {imagebindStatus === 'downloading' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {imagebindStatus === 'completed' && <CheckCircle className="w-4 h-4 mr-2" />}
              {imagebindStatus === 'pending' && <Download className="w-4 h-4 mr-2" />}
              
              {imagebindStatus === 'completed' ? 'Completed' : 
               imagebindStatus === 'downloading' ? 'Downloading...' : 'Start Download'}
            </Button>
          </div>
        </div>


      </div>

      <div className="flex justify-end">
        <Button 
          onClick={() => goToStep(2)} 
          disabled={!canProceedToStep2}
          className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg font-medium transition-all disabled:opacity-50"
        >
          Next
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderCelebration = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
        <Sparkles className="w-10 h-10 text-white" />
      </div>
      
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">🎉 Setup Complete!</h2>
        <p className="text-lg text-gray-600 mb-4">
          Vimo is ready! You can now start using intelligent video analysis features
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
        <div className="p-3 bg-green-50 rounded-lg border border-green-100">
          <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <div className="text-sm font-medium text-green-800">ImageBind</div>
          <div className="text-xs text-green-600">AI Model</div>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
          <CheckCircle className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <div className="text-sm font-medium text-purple-800">Vimo</div>
          <div className="text-xs text-purple-600">Ready!</div>
        </div>
      </div>

      <Button 
        onClick={completeInitialization}
        className="px-8 py-3 text-lg font-bold bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg shadow-lg transition-all"
      >
        Start Using Vimo
        <ArrowRight className="w-5 h-5 ml-2" />
      </Button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 z-50 overflow-auto">
      {/* Draggable area */}
      <div className="fixed top-0 left-0 right-0 h-8 bg-transparent z-50" style={{ WebkitAppRegion: 'drag' } as any}></div>
      
      <div className="min-h-full flex items-center justify-center p-4 pt-12">
        <div className="w-full max-w-3xl mx-auto">
          {/* Welcome header */}
          <div className="text-center mb-6">
            <div className="mb-4">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={vimoLogo} alt="Vimo" className="w-16 h-16 rounded-2xl shadow-lg" />
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 via-purple-600 to-pink-500 bg-clip-text text-transparent">
                  Vimo
                </h1>
              </div>
            </div>
            <p className="text-gray-600 mb-1 text-lg">Agentic Video Understanding</p>
            <p className="text-sm text-gray-500">Let's set up your AI environment</p>
          </div>

          {/* Modern Progress indicator */}
          <div className="mb-8 mt-8">
            <div className="max-w-4xl mx-auto px-8">
              {/* Progress bar background */}
              <div className="relative pt-4 pb-12">
                <div className="h-2 bg-gray-200 rounded-full">
                  <div 
                    className="h-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
                  />
                </div>
                
                {/* Step indicators */}
                <div className="absolute top-1 left-0 right-0 flex justify-between items-center">
                  {steps.map(({ step, icon: Icon, label }) => (
                    <div key={step} className="flex flex-col items-center relative">
                      {/* Step circle */}
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center border-4 border-white shadow-lg transition-all duration-300
                        ${step < currentStep 
                          ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' 
                          : step === currentStep
                            ? 'bg-purple-500 text-white animate-pulse'
                            : 'bg-gray-300 text-gray-500'
                        }
                      `}>
                        {step < currentStep ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : step === currentStep ? (
                          <Icon className="w-4 h-4" />
                        ) : (
                          <div className="w-2 h-2 bg-gray-400 rounded-full" />
                        )}
                      </div>
                      
                      {/* Step label */}
                      <span className={`mt-4 text-sm font-medium transition-colors duration-300 ${
                        step < currentStep ? 'text-purple-600' 
                        : step === currentStep ? 'text-purple-600' 
                        : 'text-gray-500'
                      }`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6">
            {currentStep === 1 && renderModelDownload()}
            {currentStep === 2 && renderCelebration()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitializationWizard; 