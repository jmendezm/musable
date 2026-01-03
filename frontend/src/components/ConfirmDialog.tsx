import React from 'react';
import clsx from 'clsx';
import {
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <ExclamationCircleIcon className="w-12 h-12 text-red-400" />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-12 h-12 text-yellow-400" />;
      case 'info':
        return <InformationCircleIcon className="w-12 h-12 text-blue-400" />;
      case 'success':
        return <CheckCircleIcon className="w-12 h-12 text-green-400" />;
      default:
        return <ExclamationCircleIcon className="w-12 h-12 text-red-400" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500';
      case 'info':
        return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
      case 'success':
        return 'bg-green-600 hover:bg-green-700 focus:ring-green-500';
      default:
        return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-75 transition-opacity" onClick={onClose}></div>

      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-md w-full animate-[scale-in_0.1s_ease-out]">
        {/* Header */}
        <div className="p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-4">
              {getIcon()}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-2">
                {title}
              </h3>
              <div className="text-gray-300 text-sm leading-relaxed">
                {message}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-900/50 rounded-b-lg flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={clsx(
              'px-4 py-2 rounded-lg transition-colors text-sm font-medium',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800',
              getButtonClass()
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
