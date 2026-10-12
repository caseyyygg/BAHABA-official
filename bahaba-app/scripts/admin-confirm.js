(function () {
  window.adminConfirm = function ({ title = 'Please confirm', message = '', confirmLabel = 'Continue', danger = false } = {}) {
    if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }

    let dialog = document.getElementById('admin-confirm-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'admin-confirm-dialog';
      dialog.className = 'admin-confirm-dialog';
      dialog.innerHTML = '<div class="admin-confirm-mark" aria-hidden="true">!</div><div class="admin-confirm-copy"><div class="admin-confirm-eyebrow">Confirm action</div><h2 class="admin-confirm-title"></h2><p class="admin-confirm-message"></p></div><div class="admin-confirm-actions"><button type="button" class="admin-confirm-cancel">Cancel</button><button type="button" class="admin-confirm-accept"></button></div>';
      document.body.append(dialog);
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close('cancel'); });
    }

    const titleNode = dialog.querySelector('.admin-confirm-title');
    const messageNode = dialog.querySelector('.admin-confirm-message');
    const cancelButton = dialog.querySelector('.admin-confirm-cancel');
    const acceptButton = dialog.querySelector('.admin-confirm-accept');
    titleNode.textContent = title;
    messageNode.textContent = message;
    acceptButton.textContent = confirmLabel;
    acceptButton.classList.toggle('is-danger', danger);

    return new Promise(resolve => {
      const finish = () => {
        cancelButton.removeEventListener('click', cancel);
        acceptButton.removeEventListener('click', accept);
        dialog.removeEventListener('close', closed);
        resolve(dialog.returnValue === 'confirm');
      };
      const cancel = () => dialog.close('cancel');
      const accept = () => dialog.close('confirm');
      const closed = () => finish();
      cancelButton.addEventListener('click', cancel);
      acceptButton.addEventListener('click', accept);
      dialog.addEventListener('close', closed, { once: true });
      dialog.showModal();
      cancelButton.focus();
    });
  };
})();
