<script lang="ts">
  import { Dialog } from 'bits-ui';
  let { open = false, mediaLabel = '', onSubmit, onClose } = $props();
  let note = $state('');

  function submit() {
    onSubmit(note);
    note = '';
  }
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) onClose(); }}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/40" />
    <Dialog.Content class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,26rem)] bg-nb-cyan border-2 border-black shadow-nb-lg p-5">
      <Dialog.Title class="text-lg font-black mb-3">REPORT ISSUE</Dialog.Title>
      <div class="bg-white border-2 border-black p-2 mb-3 font-black">{mediaLabel}</div>
      <label class="block text-xs font-black uppercase mb-1" for="note">Add a note (optional)</label>
      <textarea id="note" bind:value={note} rows="3"
        class="w-full bg-white border-2 border-black p-2 font-bold text-sm mb-4"></textarea>
      <div class="flex gap-3">
        <Dialog.Close class="flex-1 bg-white border-2 border-black shadow-nb-sm py-2 font-black">CANCEL</Dialog.Close>
        <button onclick={submit} class="flex-1 bg-nb-pink border-2 border-black shadow-nb-sm py-2 font-black">SUBMIT</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
