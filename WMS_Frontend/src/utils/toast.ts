import { toast } from 'sonner';

export const showSuccess = (message: string) => {
  toast.success(message);
};

export const showError = (message: string) => {
  toast.error(message);
};

export const showWarning = (message: string) => {
  toast.warning(message);
};

export const showInfo = (message: string) => {
  toast.info(message);
};

export const showConfirm = (message: string, onConfirm: () => void) => {
  toast.warning(message, {
    action: {
      label: 'Confirm',
      onClick: onConfirm,
    },
    duration: 8000,
  });
};
