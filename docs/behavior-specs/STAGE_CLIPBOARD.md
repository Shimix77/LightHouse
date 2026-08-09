# Stage copy, paste and duplicate

- `Cmd/Ctrl+C` copies the selected fixtures or stage objects to an application-local clipboard. Stage objects take precedence if both selection sets are populated.
- `Cmd/Ctrl+V` creates new project entities from the copied source IDs, offsets them by 0.6 m on both axes and selects the pasted objects in browser preview.
- Fixtures pasted in the native app are auto-patched through the same conflict-safe backend command used by Duplicate; copied raw DMX addresses are never reused blindly.
- `Cmd/Ctrl+D` is a one-step Copy + Paste shortcut and updates the same clipboard.
- Copy does not mutate the project and is available independently of the operating-system text clipboard. Paste and Duplicate remain structural EDIT-mode operations in the native backend.
- Repeated Paste keeps using the original copied source objects. If those sources no longer exist, the operation fails visibly instead of creating incomplete records.
- Toolbar buttons expose Copy, Paste and Duplicate for operators who prefer pointer interaction.
