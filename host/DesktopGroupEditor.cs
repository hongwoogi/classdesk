// ClassDesk desktop-native group name affordances. GPL-3.0.
// A single REGION-CLIPPED child of SHELLDLL_DefView, never an app-covering
// top-level overlay. Only an explicit user click opens a small native editor.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

sealed class DesktopGroupEditor : IDisposable
{
    readonly Func<bool> hostAvailable;
    readonly Timer watch;
    readonly List<IconGlyph> glyphs = new List<IconGlyph>();
    List<GroupLabel> labels = new List<GroupLabel>();
    PencilOverlay overlay;
    GroupNameEditor editor;
    string theme, editingId;
    Rectangle screen;
    IntPtr attachedParent;
    bool iconsVisible, paused = true, dirty = true, disposed;
    public event Action<string, string, string> NameEdited;

    public DesktopGroupEditor(Func<bool> hostAvailable)
    {
        this.hostAvailable = hostAvailable;
        watch = new Timer { Interval = 250 };
        watch.Tick += delegate { Refresh(); };
        watch.Start();
    }

    public void SetLabels(string newTheme, List<GroupLabel> next)
    {
        if (disposed) return;
        if (newTheme != theme) CancelEditor();
        theme = newTheme;
        labels = new List<GroupLabel>(next);
        if (editor != null && FindLabel(editingId) == null) CancelEditor();
        dirty = true;
        Refresh();
    }

    public void SetIcons(bool visible, IList<IconGlyph> next, Rectangle physicalScreen)
    {
        if (disposed) return;
        bool changed = screen != physicalScreen || glyphs.Count != next.Count;
        if (!changed)
            for (int i = 0; i < next.Count; i++)
                if (glyphs[i].Left != next[i].Left - physicalScreen.X || glyphs[i].Top != next[i].Top - physicalScreen.Y
                    || glyphs[i].Right != next[i].Right - physicalScreen.X || glyphs[i].Bottom != next[i].Bottom - physicalScreen.Y) { changed = true; break; }
        screen = physicalScreen;
        if (changed)
        {
            glyphs.Clear();
            foreach (IconGlyph glyph in next) glyphs.Add(new IconGlyph(glyph.Left - screen.X, glyph.Top - screen.Y, glyph.Right - screen.X, glyph.Bottom - screen.Y));
            dirty = true;
        }
        iconsVisible = visible;
        Refresh();
    }

    public void SetPaused(bool value) { if (disposed) return; paused = value; Refresh(); }

    public void Clear()
    {
        if (disposed) return;
        labels.Clear();
        theme = null;
        dirty = true;
        HideAffordances();
    }

    GroupLabel FindLabel(string id)
    {
        foreach (GroupLabel label in labels) if (label.Id == id) return label;
        return null;
    }

    void Refresh()
    {
        if (disposed) return;
        if (!iconsVisible || paused || !hostAvailable()) { HideAffordances(); return; }
        IntPtr parent = IconReader.FindDesktopParent();
        if (parent == IntPtr.Zero || !Native.IsWindow(parent) || !Native.IsWindowVisible(parent)) { DropOverlay(); return; }
        IntPtr list = Native.FindWindowEx(parent, IntPtr.Zero, "SysListView32", null);
        if (list == IntPtr.Zero || !Native.IsWindowVisible(list)) { HideAffordances(); return; }
        if (parent != attachedParent || overlay == null || overlay.IsDisposed || !overlay.IsHandleCreated)
        {
            DropOverlay();
            if (!AttachOverlay(parent)) return; // No fallback to a top-level window.
        }
        if (labels.Count == 0) { HideAffordances(); return; }
        DesktopDpiScope updateScope = DesktopDpiScope.Enter(parent);
        if (updateScope == null) { DropOverlay(); return; }
        using (updateScope)
        {
        try
        {
            if (dirty)
            {
                overlay.SetButtons(labels, glyphs, screen);
                dirty = false;
            }
            if (overlay.Controls.Count == 0) { HideAffordances(); return; }
            if (!overlay.Place(screen)) { DropOverlay(); return; }
            if (!overlay.Visible) overlay.Show();
        }
        catch (Exception ex) { Log.Write("바탕화면 이름 편집 표시 중단: " + ex.Message); DropOverlay(); }
        }
    }

    bool AttachOverlay(IntPtr parent)
    {
        // SetParent can reset the CHILD PROCESS's DPI context on cross-process
        // mismatch. Create the hidden child under the exact Explorer context,
        // verify both contexts BEFORE any SetParent, and fail closed otherwise.
        // https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setparent
        DesktopDpiScope scope = DesktopDpiScope.Enter(parent);
        if (scope == null) return false;
        using (scope)
        {
            PencilOverlay candidate = null;
            try
            {
                candidate = new PencilOverlay(parent);
                if (!candidate.AttachNative(parent)) { candidate.Dispose(); return false; }
                candidate.EditClicked += OpenEditor;
                overlay = candidate;
                attachedParent = parent;
                dirty = true;
                return true;
            }
            catch (Exception ex)
            {
                if (candidate != null) candidate.Dispose();
                Log.Write("바탕화면 이름 편집 연결 중단: " + ex.Message);
                return false;
            }
        }
    }

    void OpenEditor(string id)
    {
        if (disposed || paused || !iconsVisible || !hostAvailable() || overlay == null || !overlay.Visible
            || IconReader.FindDesktopParent() != attachedParent) return;
        GroupLabel label = FindLabel(id);
        if (label == null) return;
        CancelEditor();
        string editTheme = theme;
        var candidate = new GroupNameEditor(label.Text, new Point(screen.X + (int)label.Rect.X, screen.Y + (int)label.Rect.Y));
        editingId = id;
        editor = candidate;
        candidate.Saved += delegate(string text)
        {
            if (!disposed && !paused && iconsVisible && hostAvailable() && theme == editTheme && FindLabel(id) != null
                && attachedParent != IntPtr.Zero && IconReader.FindDesktopParent() == attachedParent && NameEdited != null)
                NameEdited(editTheme, id, text);
        };
        candidate.FormClosed += delegate { if (editor == candidate) { editor = null; editingId = null; } };
        candidate.Show(); // Only the user's pencil click may activate this small window.
        candidate.Activate();
    }

    void CancelEditor()
    {
        GroupNameEditor old = editor;
        editor = null;
        editingId = null;
        if (old != null) { old.Close(); old.Dispose(); }
    }

    void HideAffordances()
    {
        CancelEditor();
        if (overlay != null && !overlay.IsDisposed) overlay.Hide();
    }

    void DropOverlay()
    {
        HideAffordances();
        if (overlay != null) { overlay.Dispose(); overlay = null; }
        attachedParent = IntPtr.Zero;
        dirty = true;
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        watch.Stop(); watch.Dispose();
        DropOverlay();
        labels.Clear(); glyphs.Clear();
    }
}

sealed class PencilOverlay : Form
{
    readonly IntPtr desktopParent;
    public event Action<string> EditClicked;
    protected override bool ShowWithoutActivation { get { return true; } }

    public PencilOverlay(IntPtr parent)
    {
        desktopParent = parent;
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None; // Protocol and hit areas are physical pixels.
        BackColor = Color.Magenta;
        TransparencyKey = Color.Magenta;
        Text = "ClassDeskGroupPencils";
        AccessibleName = "바탕화면 구역 이름 편집";
        var region = new Region(); region.MakeEmpty(); Region = region;
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.Parent = desktopParent;
            cp.Style = (cp.Style & ~(Native.WS_POPUP | Native.WS_CAPTION | Native.WS_THICKFRAME)) | Native.WS_CHILD;
            cp.ExStyle |= DesktopEditorNative.WS_EX_NOACTIVATE | 0x80 /* TOOLWINDOW */;
            return cp;
        }
    }

    public bool AttachNative(IntPtr parent)
    {
        IntPtr handle = Handle; // Created hidden with an empty region and matching DPI.
        IntPtr parentContext = DesktopEditorNative.GetWindowDpiAwarenessContext(parent);
        IntPtr childContext = DesktopEditorNative.GetWindowDpiAwarenessContext(handle);
        if (!DesktopEditorNative.AreDpiAwarenessContextsEqual(parentContext, childContext)) return false;
        int style = Native.GetWindowLong(handle, Native.GWL_STYLE);
        Native.SetWindowLong(handle, Native.GWL_STYLE, (style & ~Native.WS_POPUP) | Native.WS_CHILD);
        if (DesktopEditorNative.GetParent(handle) != parent) Native.SetParent(handle, parent);
        return DesktopEditorNative.GetParent(handle) == parent && Native.IsWindow(parent)
            && (Native.GetWindowLong(handle, Native.GWL_STYLE) & Native.WS_CHILD) != 0
            && (Native.GetWindowLong(handle, Native.GWL_STYLE) & Native.WS_POPUP) == 0;
    }

    public bool Place(Rectangle screen)
    {
        if (!Native.IsWindow(desktopParent) || DesktopEditorNative.GetParent(Handle) != desktopParent) return false;
        var origin = new Native.POINT { X = screen.X, Y = screen.Y };
        if (!Native.ScreenToClient(desktopParent, ref origin)) return false;
        // HWND_TOP applies ONLY among this desktop parent's child windows.
        return Native.SetWindowPos(Handle, IntPtr.Zero, origin.X, origin.Y, screen.Width, screen.Height, Native.SWP_NOACTIVATE);
    }

    public void SetButtons(List<GroupLabel> labels, IList<IconGlyph> icons, Rectangle screen)
    {
        SuspendLayout();
        try
        {
            while (Controls.Count > 0) { Control old = Controls[0]; Controls.Remove(old); old.Dispose(); }
            var region = new Region();
            region.MakeEmpty();
            var occupied = new List<PhysicalRect>();
            foreach (GroupLabel label in labels) occupied.Add(label.Rect); // Never cover another visible name.
            foreach (GroupLabel label in labels)
            {
                PhysicalRect? rect = DesktopEditGeometry.ButtonRect(label, screen.Width, screen.Height, icons, occupied);
                if (!rect.HasValue) continue;
                PhysicalRect area = rect.Value;
                var button = new FluentEditButton { Bounds = new Rectangle((int)Math.Round(area.X), (int)Math.Round(area.Y), 24, 24),
                    AccessibleName = label.Text + " 구역 이름 편집", AccessibleDescription = "이름 입력 후 Enter로 저장, Esc로 취소합니다.",
                    AccessibleRole = AccessibleRole.PushButton };
                string id = label.Id;
                button.Click += delegate { if (EditClicked != null) EditClicked(id); };
                Controls.Add(button);
                region.Union(button.Bounds); // ONLY actual 24px pencil buttons receive input.
                occupied.Add(new PhysicalRect(button.Left, button.Top, button.Width, button.Height));
            }
            Region previous = Region;
            Region = region;
            if (previous != null) previous.Dispose();
        }
        finally { ResumeLayout(false); }
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0021 /* WM_MOUSEACTIVATE */) { message.Result = new IntPtr(3) /* MA_NOACTIVATE */; return; }
        base.WndProc(ref message);
    }
}

sealed class FluentEditButton : Button
{
    bool hovered;

    public FluentEditButton()
    {
        Text = "";
        TabStop = false;
        FlatStyle = FlatStyle.Flat;
        BackColor = Color.FromArgb(247, 249, 244);
        ForeColor = Color.FromArgb(45, 92, 72);
        Cursor = Cursors.Hand;
        UseVisualStyleBackColor = false;
        FlatAppearance.BorderSize = 0;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }

    protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hovered = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(hovered ? Color.FromArgb(236, 243, 234) : BackColor);
        // Fluent UI System Icons `Edit` (ic_fluent_edit_20_regular) scaled into the 24x24 button without a box border.
        using (var pen = new Pen(ForeColor, 1.55f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
        {
            var body = new PointF[]
            {
                new PointF(6.2f, 17.8f),
                new PointF(7.1f, 13.9f),
                new PointF(14.9f, 6.1f),
                new PointF(17.9f, 9.1f),
                new PointF(10.1f, 16.9f),
            };
            g.DrawPolygon(pen, body);
            g.DrawLine(pen, 13.3f, 7.7f, 16.3f, 10.7f);
        }
    }
}

sealed class GroupNameEditor : Form
{
    readonly NameTextBox nameBox;
    bool closing;
    public event Action<string> Saved;

    public GroupNameEditor(string name, Point location)
    {
        Text = "구역 이름 편집";
        AccessibleName = "구역 이름 편집";
        FormBorderStyle = FormBorderStyle.FixedToolWindow;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(330, 108);
        MaximizeBox = false; MinimizeBox = false;
        var prompt = new Label { Text = "구역 이름 (최대 40자)", AutoSize = true, Location = new Point(12, 10) };
        nameBox = new NameTextBox { Text = name, MaxLength = 80, AccessibleName = "구역 이름",
            AccessibleDescription = "최대 40자. Enter 저장, Esc 또는 바깥쪽 클릭 취소.", Location = new Point(12, 32), Width = 306, TabIndex = 0 };
        var save = new Button { Text = "저장", Location = new Point(162, 70), Width = 74, TabIndex = 1 };
        var cancel = new Button { Text = "취소", Location = new Point(244, 70), Width = 74, TabIndex = 2 };
        save.Click += delegate { Commit(); };
        cancel.Click += delegate { Close(); };
        Controls.AddRange(new Control[] { prompt, nameBox, save, cancel });
        Rectangle work = Screen.FromPoint(location).WorkingArea;
        Location = new Point(Math.Max(work.Left, Math.Min(location.X, work.Right - Width)), Math.Max(work.Top, Math.Min(location.Y, work.Bottom - Height)));
        Deactivate += delegate { if (!closing) Close(); }; // Outside click cancels, never commits.
        Shown += delegate { nameBox.Focus(); nameBox.SelectAll(); };
        FormClosing += delegate { closing = true; };
    }

    void Commit()
    {
        if (closing || nameBox.Composing) return;
        string text = GroupStateRules.PlainText(nameBox.Text);
        closing = true;
        Close();
        if (Saved != null) Saved(text);
    }

    protected override bool ProcessCmdKey(ref Message message, Keys keyData)
    {
        if (keyData == Keys.Escape) { Close(); return true; }
        if (keyData == Keys.Enter && !nameBox.Composing) { Commit(); return true; }
        return base.ProcessCmdKey(ref message, keyData);
    }

    sealed class NameTextBox : TextBox
    {
        public bool Composing { get; private set; }
        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 0x010D /* WM_IME_STARTCOMPOSITION */) Composing = true;
            if (message.Msg == 0x010E /* WM_IME_ENDCOMPOSITION */) Composing = false;
            base.WndProc(ref message);
        }
    }
}

sealed class DesktopDpiScope : IDisposable
{
    readonly IntPtr previous;
    DesktopDpiScope(IntPtr previous) { this.previous = previous; }
    public static DesktopDpiScope Enter(IntPtr parent)
    {
        IntPtr previous = IntPtr.Zero;
        try
        {
            IntPtr context = DesktopEditorNative.GetWindowDpiAwarenessContext(parent);
            // Physical-pixel placement is only supported for per-monitor-aware
            // Explorer windows. Older/unaware parents intentionally have no overlay.
            if (context == IntPtr.Zero || DesktopEditorNative.GetAwarenessFromDpiAwarenessContext(context) != 2) return null;
            previous = DesktopEditorNative.SetThreadDpiAwarenessContext(context);
            if (previous == IntPtr.Zero) return null;
            if (!DesktopEditorNative.AreDpiAwarenessContextsEqual(DesktopEditorNative.GetThreadDpiAwarenessContext(), context))
            { DesktopEditorNative.SetThreadDpiAwarenessContext(previous); return null; }
            return new DesktopDpiScope(previous);
        }
        catch
        {
            if (previous != IntPtr.Zero) DesktopEditorNative.SetThreadDpiAwarenessContext(previous);
            return null;
        }
    }
    public void Dispose() { DesktopEditorNative.SetThreadDpiAwarenessContext(previous); }
}

static class DesktopEditorNative
{
    public const int WS_EX_NOACTIVATE = 0x08000000;
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool AreDpiAwarenessContextsEqual(IntPtr a, IntPtr b);
    [DllImport("user32.dll")] public static extern int GetAwarenessFromDpiAwarenessContext(IntPtr context);
}
