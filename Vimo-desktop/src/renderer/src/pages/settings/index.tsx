import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  Download,
  Settings as SettingsIcon,
  Cpu,
  Sliders,
} from 'lucide-react';

interface ModelOption {
  name: string;
  default: boolean;
}

interface ModelOptions {
  processing_models: ModelOption[];
  analysis_models: ModelOption[];
  caption_models: ModelOption[];
  asr_models: ModelOption[];
  embedding_models: ModelOption[];
}

interface SettingsState {
  processingModel: string;
  analysisModel: string;
  captionModel: string;
  asrModel: string;
}

const Settings = () => {
  const [settings, setSettings] = useState<SettingsState>({
    processingModel: '',
    analysisModel: '',
    captionModel: '',
    asrModel: '',
  });

  const [modelOptions, setModelOptions] = useState<ModelOptions | null>(null);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(true);
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');

  // Model Status Section Component
  const ModelStatusSection = () => {
    const [modelStatus, setModelStatus] = useState<{
      imagebind: boolean;
      checking: boolean;
    }>({
      imagebind: false,
      checking: false,
    });

    const [storeDirectory, setStoreDirectory] = useState('');

    const checkModelStatus = async () => {
      setModelStatus((prev) => ({ ...prev, checking: true }));
      try {
        // Get storage path from backend config
        const configResult = await window.api.videorag.getConfig();
        if (configResult.success && configResult.data?.base_storage_path) {
          const dir = configResult.data.base_storage_path;
          setStoreDirectory(dir);
          const result = await window.api.checkModelFiles(dir);
          setModelStatus({ imagebind: result.imagebind, checking: false });
        } else {
          setModelStatus({ imagebind: false, checking: false });
        }
      } catch (error) {
        console.error('Failed to check model status:', error);
        setModelStatus({ imagebind: false, checking: false });
      }
    };

    useEffect(() => {
      checkModelStatus();
    }, []);

    const getStatusMessage = () => {
      if (modelStatus.checking) return 'Checking model status...';
      if (modelStatus.imagebind) return 'Ready to use';
      return 'Model not found - run initialization wizard';
    };

    const getStatusColor = () => {
      if (modelStatus.imagebind) return 'text-green-600';
      return 'text-gray-500';
    };

    return (
      <div className="p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Cpu className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">ImageBind Model</h4>
                {modelStatus.checking ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                ) : modelStatus.imagebind ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
              <p className="text-xs text-gray-500">~4.5GB • Image Understanding</p>
              <p className={`text-sm ${getStatusColor()}`}>{getStatusMessage()}</p>
              {storeDirectory && (
                <p className="text-xs text-gray-400 mt-1">
                  Storage: {storeDirectory}
                </p>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={checkModelStatus}
            disabled={modelStatus.checking}
          >
            {modelStatus.checking ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Check Status
          </Button>
        </div>
      </div>
    );
  };

  // Fetch model options from API
  useEffect(() => {
    fetchModelOptions();
  }, []);

  // Load saved settings
  useEffect(() => {
    loadSettings();
  }, []);

  const fetchModelOptions = async () => {
    setModelOptionsLoading(true);
    setModelOptionsError(null);
    try {
      const result = await window.api.videorag.getConfig();
      if (result.success && result.data?.models) {
        setModelOptions(result.data.models);
      } else {
        setModelOptionsError('Failed to load model options from API');
      }
    } catch (error) {
      console.error('Failed to fetch model options:', error);
      setModelOptionsError('Cannot connect to backend API');
    } finally {
      setModelOptionsLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const result = await window.api.loadSettings();
      if (result.success && result.settings) {
        setSettings((prev) => ({ ...prev, ...result.settings }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  // Apply defaults from API when model options load and settings are empty
  useEffect(() => {
    if (!modelOptions) return;
    setSettings((prev) => {
      const updated = { ...prev };
      if (!updated.processingModel) {
        const def = modelOptions.processing_models.find((m) => m.default);
        if (def) updated.processingModel = def.name;
      }
      if (!updated.analysisModel) {
        const def = modelOptions.analysis_models.find((m) => m.default);
        if (def) updated.analysisModel = def.name;
      }
      if (!updated.captionModel) {
        const def = modelOptions.caption_models.find((m) => m.default);
        if (def) updated.captionModel = def.name;
      }
      if (!updated.asrModel) {
        const def = modelOptions.asr_models.find((m) => m.default);
        if (def) updated.asrModel = def.name;
      }
      return updated;
    });
  }, [modelOptions]);

  const handleModelChange = (field: keyof SettingsState, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const saveResult = await window.api.saveSettings(settings);
      if (!saveResult.success) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return;
      }

      // Re-initialize backend with new model selections
      try {
        const initResult = await window.api.videorag.reinitializeConfig();
        if (initResult.success) {
          console.log('✅ Configuration updated successfully');
        } else {
          console.warn('⚠️ Settings saved but backend reinit failed:', initResult.error);
        }
      } catch (initError) {
        console.warn('⚠️ Settings saved but backend reinit failed:', initError);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const getSaveButtonText = () => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved!';
      case 'error':
        return 'Save Failed';
      default:
        return 'Save Model Selection';
    }
  };

  const getSaveButtonIcon = () => {
    switch (saveStatus) {
      case 'saving':
        return <RefreshCw className="animate-spin" size={16} />;
      case 'saved':
        return <CheckCircle className="text-green-600" size={16} />;
      case 'error':
        return <XCircle className="text-red-600" size={16} />;
      default:
        return <Sliders size={16} />;
    }
  };

  // Restart initialization wizard
  const restartInitializationWizard = async () => {
    const confirmed = window.confirm(
      'This will restart the application and reset all initialization settings. Are you sure you want to continue?',
    );

    if (!confirmed) return;

    try {
      console.log('Clearing configuration files...');
      await window.api.app.clearConfig();
      console.log('Restarting application...');
      await window.api.app.restart();
    } catch (error) {
      console.error('Failed to restart initialization wizard:', error);
      alert('Failed to restart setup wizard. Please try again.');
    }
  };

  const renderModelSelect = (
    label: string,
    description: string,
    field: keyof SettingsState,
    options: ModelOption[] | undefined,
  ) => {
    if (!options || options.length === 0) {
      return (
        <div>
          <label className="text-sm font-medium block mb-2">{label}</label>
          <input
            type="text"
            value={settings[field] || '—'}
            readOnly
            className="w-full px-3 py-2 text-sm border rounded-md bg-gray-100 text-gray-600"
          />
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
      );
    }

    return (
      <div>
        <label className="text-sm font-medium block mb-2">{label}</label>
        <select
          value={settings[field]}
          onChange={(e) => handleModelChange(field, e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {options.map((opt) => (
            <option key={opt.name} value={opt.name}>
              {opt.name}
              {opt.default ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Area */}
      <div
        className="draggable-area h-8 w-full"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Configure your Vimo application preferences.
            </p>
          </div>

          {/* Model Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Sliders size={20} />
                </div>
                <div>
                  <CardTitle>Model Selection</CardTitle>
                  <CardDescription>
                    Choose AI models for different processing tasks. Options are provided by the backend API.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {modelOptionsLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading model options from API...</span>
                </div>
              ) : modelOptionsError ? (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="text-red-600 mt-0.5" size={16} />
                  <div className="text-sm">
                    <p className="font-medium text-red-800">{modelOptionsError}</p>
                    <p className="text-red-700 mt-1">
                      Make sure the backend API is running and try again.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={fetchModelOptions}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Retry
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Processing Models */}
                  <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800">
                      Text Processing Models
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {renderModelSelect(
                        'Processing Model',
                        'Used for high-volume preprocessing tasks',
                        'processingModel',
                        modelOptions?.processing_models,
                      )}
                      {renderModelSelect(
                        'Analysis Model',
                        'Used for detailed analysis tasks',
                        'analysisModel',
                        modelOptions?.analysis_models,
                      )}
                    </div>
                  </div>

                  {/* Caption / ASR Models */}
                  <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800">
                      Video Processing Models
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {renderModelSelect(
                        'Caption Model',
                        'Used for video captioning tasks',
                        'captionModel',
                        modelOptions?.caption_models,
                      )}
                      {renderModelSelect(
                        'ASR Model',
                        'Used for speech recognition tasks',
                        'asrModel',
                        modelOptions?.asr_models,
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    System configuration (API keys, base URLs, storage paths) is managed via backend
                    environment variables.
                  </p>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={handleSave}
                      disabled={saveStatus === 'saving'}
                      className="px-6"
                    >
                      {getSaveButtonIcon()}
                      <span className="ml-2">{getSaveButtonText()}</span>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Model Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Download size={20} />
                </div>
                <div>
                  <CardTitle>AI Model Status</CardTitle>
                  <CardDescription>Check the status of ImageBind model</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ModelStatusSection />
            </CardContent>
          </Card>

          {/* Setup Wizard */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <SettingsIcon size={20} />
                </div>
                <div>
                  <CardTitle>Setup Wizard</CardTitle>
                  <CardDescription>
                    Re-run the initial configuration wizard to download models and check
                    environment
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="text-blue-600 mt-0.5" size={16} />
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Setup Wizard</p>
                  <p className="text-blue-700 mt-1">
                    Guide you through AI model downloads and environment configuration.
                  </p>
                </div>
              </div>

              <div className="flex justify-start">
                <Button onClick={restartInitializationWizard} variant="outline" className="px-6 py-2">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Re-run Setup Wizard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
