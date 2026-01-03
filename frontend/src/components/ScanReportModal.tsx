import React, { useEffect, useState } from 'react';
import {
  XMarkIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../services/api';
import clsx from 'clsx';

interface ScanError {
  id: number;
  scan_report_id: number;
  file_path: string;
  error_message: string;
  error_type?: string;
  created_at: string;
}

interface ScanReport {
  id: number;
  library_path_id: number;
  scan_id?: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  started_at: string;
  completed_at?: string;
  files_scanned: number;
  files_added: number;
  files_updated: number;
  files_skipped: number;
  errors_count: number;
  error_message?: string;
  progress: number;
  total_files: number;
  created_at: string;
  updated_at: string;
  errors?: ScanError[];
}

interface ScanReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pathId: number;
  pathName: string;
}

const ScanReportModal: React.FC<ScanReportModalProps> = ({
  isOpen,
  onClose,
  pathId,
  pathName
}) => {
  const [reports, setReports] = useState<ScanReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ScanReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchReports();
    }
  }, [isOpen, pathId]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.request('GET', `/admin/library/paths/${pathId}/scans`) as {
        data: { reports: ScanReport[] }
      };
      setReports(response.data.reports);
    } catch (err: any) {
      console.error('Failed to fetch scan reports:', err);
      setError(err.message || 'Failed to load scan reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchReportDetail = async (reportId: number) => {
    try {
      const response = await apiService.request('GET', `/admin/library/paths/${pathId}/scans/${reportId}`) as {
        data: { report: ScanReport }
      };
      setSelectedReport(response.data.report);
    } catch (err: any) {
      console.error('Failed to fetch scan report details:', err);
    }
  };

  const getStatusIcon = (status: ScanReport['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircleIcon className="w-5 h-5 text-red-400" />;
      case 'stopped':
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400" />;
      case 'running':
        return <ClockIcon className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: ScanReport['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'stopped':
        return 'Stopped';
      case 'running':
        return 'Running';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (started: string, completed?: string) => {
    const start = new Date(started);
    const end = completed ? new Date(completed) : new Date();
    const durationMs = end.getTime() - start.getTime();

    if (durationMs < 60000) {
      return `${Math.round(durationMs / 1000)}s`;
    } else if (durationMs < 3600000) {
      return `${Math.round(durationMs / 60000)}m`;
    } else {
      return `${Math.round(durationMs / 3600000)}h`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-white">Scan Reports</h2>
              <p className="text-gray-400 text-sm mt-1">{pathName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : error ? (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                <p className="text-red-400">{error}</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12">
                <DocumentTextIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No scan reports available for this path.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Reports List */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-white mb-4">Scan History</h3>
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      onClick={() => fetchReportDetail(report.id)}
                      className={clsx(
                        'bg-gray-700 rounded-lg p-4 cursor-pointer transition-colors hover:bg-gray-600',
                        selectedReport?.id === report.id && 'ring-2 ring-primary'
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(report.status)}
                          <span className="text-white font-medium">{getStatusText(report.status)}</span>
                        </div>
                        <span className="text-gray-400 text-sm">
                          {formatDate(report.started_at)}
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-3 text-sm">
                        <div>
                          <div className="text-gray-300 font-medium">{report.files_scanned}</div>
                          <div className="text-gray-400 text-xs">Scanned</div>
                        </div>
                        <div>
                          <div className="text-green-400 font-medium">{report.files_added}</div>
                          <div className="text-gray-400 text-xs">Added</div>
                        </div>
                        <div>
                          <div className="text-blue-400 font-medium">{report.files_updated}</div>
                          <div className="text-gray-400 text-xs">Updated</div>
                        </div>
                        <div>
                          <div className="text-yellow-400 font-medium">{report.files_skipped}</div>
                          <div className="text-gray-400 text-xs">Skipped</div>
                        </div>
                        <div>
                          <div className={clsx(
                            'font-medium',
                            report.errors_count > 0 ? 'text-red-400' : 'text-gray-300'
                          )}>
                            {report.errors_count}
                          </div>
                          <div className="text-gray-400 text-xs">Errors</div>
                        </div>
                      </div>

                      {report.progress < 100 && report.status === 'running' && (
                        <div className="mt-3">
                          <div className="w-full bg-gray-600 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${report.progress}%` }}
                            ></div>
                          </div>
                          <div className="text-gray-400 text-xs mt-1">
                            {report.files_scanned} / {report.total_files} files ({report.progress}%)
                          </div>
                        </div>
                      )}

                      <div className="mt-2 text-xs text-gray-400 flex items-center justify-between">
                        <span>Duration: {formatDuration(report.started_at, report.completed_at)}</span>
                        {report.status === 'running' && (
                          <span className="text-blue-400">In progress...</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Report Details */}
                <div>
                  {selectedReport ? (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">Report Details</h3>

                      <div className="bg-gray-700 rounded-lg p-4 mb-4">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <div className="text-gray-400 text-sm">Status</div>
                            <div className="flex items-center gap-2 mt-1">
                              {getStatusIcon(selectedReport.status)}
                              <span className="text-white font-medium">{getStatusText(selectedReport.status)}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-sm">Duration</div>
                            <div className="text-white font-medium mt-1">
                              {formatDuration(selectedReport.started_at, selectedReport.completed_at)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-3 text-sm border-t border-gray-600 pt-4">
                          <div>
                            <div className="text-gray-300 font-medium text-lg">{selectedReport.files_scanned}</div>
                            <div className="text-gray-400 text-xs">Scanned</div>
                          </div>
                          <div>
                            <div className="text-green-400 font-medium text-lg">{selectedReport.files_added}</div>
                            <div className="text-gray-400 text-xs">Added</div>
                          </div>
                          <div>
                            <div className="text-blue-400 font-medium text-lg">{selectedReport.files_updated}</div>
                            <div className="text-gray-400 text-xs">Updated</div>
                          </div>
                          <div>
                            <div className="text-yellow-400 font-medium text-lg">{selectedReport.files_skipped}</div>
                            <div className="text-gray-400 text-xs">Skipped</div>
                          </div>
                          <div>
                            <div className={clsx(
                              'font-medium text-lg',
                              selectedReport.errors_count > 0 ? 'text-red-400' : 'text-gray-300'
                            )}>
                              {selectedReport.errors_count}
                            </div>
                            <div className="text-gray-400 text-xs">Errors</div>
                          </div>
                        </div>

                        {selectedReport.error_message && (
                          <div className="mt-4 p-3 bg-red-900/20 border border-red-500 rounded">
                            <div className="text-red-400 text-sm font-medium mb-1">Error Message</div>
                            <div className="text-red-300 text-xs">{selectedReport.error_message}</div>
                          </div>
                        )}
                      </div>

                      {/* Errors List */}
                      {selectedReport.errors && selectedReport.errors.length > 0 ? (
                        <div>
                          <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
                            Errors ({selectedReport.errors.length})
                          </h4>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {selectedReport.errors.map((error) => (
                              <div key={error.id} className="bg-gray-700 rounded-lg p-3">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-white text-sm font-medium truncate">
                                      {error.file_path.split(/[/\\]/).pop()}
                                    </div>
                                    <div className="text-gray-400 text-xs truncate mt-1">
                                      {error.file_path}
                                    </div>
                                  </div>
                                  {error.error_type && (
                                    <span className="ml-2 px-2 py-1 bg-red-900/30 text-red-400 text-xs rounded">
                                      {error.error_type}
                                    </span>
                                  )}
                                </div>
                                <div className="text-red-400 text-xs bg-red-900/10 p-2 rounded">
                                  {error.error_message}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-green-900/20 border border-green-500 rounded-lg p-6 text-center">
                          <CheckCircleIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
                          <p className="text-green-400 font-medium">No Errors</p>
                          <p className="text-gray-400 text-sm mt-1">All files were processed successfully</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-700 rounded-lg p-8 text-center">
                      <DocumentTextIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">Select a scan report to view details</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScanReportModal;
