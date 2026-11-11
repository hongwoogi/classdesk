// ClassDesk group-state protocol and validation; pure C# 5, GPL-3.0.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;

struct PhysicalRect
{
    public double X, Y, Width, Height;
    public PhysicalRect(double x, double y, double width, double height)
    { X = x; Y = y; Width = width; Height = height; }
}

sealed class GroupLabel
{
    public string Id, Text;
    public PhysicalRect Rect;
    public PhysicalRect? EditRect;
    public bool HasExplicitEditRect;
}

static class GroupStateRules
{
    public const int MaxCatalogRecords = 512;
    public const int MaxMembersPerGroup = 500;
    public const int MaxCatalogMemberships = MaxCatalogRecords * MaxMembersPerGroup;
    // Covers all 256000 SafeId memberships, including 128-character IDs, plus metadata.
    public const int MaxJsonCharacters = 67108864; // 64 Mi characters; parsing and serialization stay bounded.

    public static void ResetVisual(Dictionary<string, object> settings)
    {
        foreach (string key in new List<string>(settings.Keys))
            if (key != "groupNames" && key != "groupCatalog") settings.Remove(key);
    }

    public static object Get(Dictionary<string, object> value, string key)
    {
        object found;
        return value != null && value.TryGetValue(key, out found) ? found : null;
    }

    public static bool SafeId(string id)
    {
        if (string.IsNullOrEmpty(id) || id.Length > 128 || id == "__proto__" || id == "prototype" || id == "constructor") return false;
        foreach (char c in id)
            if (!(c >= 'a' && c <= 'z') && !(c >= 'A' && c <= 'Z') && !(c >= '0' && c <= '9')
                && c != '-' && c != '_' && c != '.' && c != ':') return false;
        return true;
    }

    public static bool SafeObject(Dictionary<string, object> value)
    {
        if (value == null || value.Count > 32) return false;
        foreach (string key in value.Keys) if (!SafeId(key)) return false;
        return true;
    }

    static bool Number(object value, out double number)
    {
        number = 0;
        if (!(value is int || value is long || value is double || value is decimal || value is float || value is short || value is byte)) return false;
        number = Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
        return !double.IsNaN(number) && !double.IsInfinity(number);
    }

    static bool Integer(object value, long min, long max, out long integer)
    {
        integer = 0;
        double number;
        if (!Number(value, out number) || number < min || number > max || number != Math.Floor(number)) return false;
        integer = (long)number;
        return true;
    }

    public static bool TryRect(object raw, out PhysicalRect rect)
    {
        rect = new PhysicalRect();
        var array = raw as IList;
        var map = raw as Dictionary<string, object>;
        object x, y, w, h;
        if (array != null && array.Count == 4) { x = array[0]; y = array[1]; w = array[2]; h = array[3]; }
        else if (SafeObject(map)) { x = Get(map,"x"); y = Get(map,"y"); w = Get(map,"w"); h = Get(map,"h"); }
        else return false;
        double nx, ny, nw, nh;
        if (!Number(x,out nx) || !Number(y,out ny) || !Number(w,out nw) || !Number(h,out nh)
            || Math.Abs(nx) > 100000 || Math.Abs(ny) > 100000 || nw <= 0 || nh <= 0 || nw > 100000 || nh > 100000
            || nx + nw > 100000 || ny + nh > 100000) return false;
        rect = new PhysicalRect(nx,ny,nw,nh);
        return true;
    }

    public static string PlainText(string text)
    {
        if (text == null) return "";
        var clean = new StringBuilder();
        int count = 0;
        for (int i = 0; i < text.Length && i < 4096 && count < 40; i++)
        {
            char c = text[i];
            if (char.IsHighSurrogate(c))
            {
                if (i + 1 < text.Length && char.IsLowSurrogate(text[i+1])) { clean.Append(c).Append(text[++i]); count++; }
            }
            else if (!char.IsLowSurrogate(c) && !char.IsControl(c) && !(c >= '\u202A' && c <= '\u202E') && !(c >= '\u2066' && c <= '\u2069'))
            { clean.Append(c); count++; }
            else if (char.IsWhiteSpace(c)) { clean.Append(' '); count++; }
        }
        return clean.ToString().Trim();
    }

    public static Dictionary<string, object> SanitizeNames(object raw, object rawCatalog)
    {
        var source = raw as Dictionary<string, object>;
        if (source == null || source.Count > 4096 || source.ContainsKey("__proto__") || source.ContainsKey("prototype") || source.ContainsKey("constructor")) return null;
        var ordered = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var catalog = CleanCatalog(rawCatalog);
        if (catalog != null)
            foreach (Dictionary<string, object> group in (IList)catalog["groups"])
                if ((bool)group["active"] && seen.Add((string)group["id"])) ordered.Add((string)group["id"]);
        foreach (string id in source.Keys) if (seen.Add(id)) ordered.Add(id);
        var result = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (string id in ordered)
        {
            if (result.Count >= 512) break;
            string text = Get(source,id) as string;
            if (!SafeId(id) || text == null) continue;
            string clean = PlainText(text);
            if (clean.Length > 0) result[id] = clean;
        }
        return result;
    }

    static Dictionary<string, object> RectObject(PhysicalRect rect)
    {
        return new Dictionary<string, object> { {"x",rect.X}, {"y",rect.Y}, {"w",rect.Width}, {"h",rect.Height} };
    }

    static bool Extensions(Dictionary<string, object> source, Dictionary<string, object> target, params string[] known)
    {
        var keys = new List<string>(source.Keys);
        keys.Sort(StringComparer.Ordinal);
        foreach (string key in keys)
        {
            if (Array.IndexOf(known, key) >= 0) continue;
            long value;
            if (!Integer(source[key], 0, 9007199254740991L, out value)) return false;
            target[key] = value <= int.MaxValue ? (object)(int)value : value;
        }
        return true;
    }

    public static Dictionary<string, object> CleanCatalog(object raw)
    {
        var catalog = raw as Dictionary<string, object>;
        long version, nextId;
        if (!SafeObject(catalog) || !Integer(Get(catalog,"version"),1,1,out version)
            || !Integer(Get(catalog,"nextId"),1,int.MaxValue,out nextId)) return null;
        var groups = Get(catalog,"groups") as IList;
        if (groups == null || groups.Count > MaxCatalogRecords) return null;
        var cleanGroups = new List<Dictionary<string, object>>();
        var groupIds = new HashSet<string>(StringComparer.Ordinal);
        int activeCount = 0, memberCount = 0;
        foreach (object value in groups)
        {
            var group = value as Dictionary<string, object>;
            if (!SafeObject(group)) return null;
            string id = Get(group,"id") as string;
            bool active;
            object activeValue = Get(group,"active");
            long color;
            PhysicalRect bounds;
            if (!SafeId(id) || !groupIds.Add(id) || !(activeValue is bool)
                || !Integer(Get(group,"colorIndex"),0,65535,out color) || !TryRect(Get(group,"bounds"),out bounds)) return null;
            active = (bool)activeValue;
            if (active && ++activeCount > 500) return null;
            var members = Get(group,"members") as IList;
            if (members == null || members.Count > MaxMembersPerGroup || (memberCount += members.Count) > MaxCatalogMemberships) return null;
            var cleanMembers = new List<string>();
            var memberIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (object member in members)
            {
                string memberId = member as string;
                if (!SafeId(memberId) || !memberIds.Add(memberId)) return null;
                cleanMembers.Add(memberId);
            }
            cleanMembers.Sort(StringComparer.Ordinal);
            var clean = new Dictionary<string, object> { {"id",id}, {"members",cleanMembers.ToArray()},
                {"bounds",RectObject(bounds)}, {"colorIndex",(int)color}, {"active",active} };
            if (!Extensions(group,clean,"id","members","bounds","colorIndex","active")) return null;
            cleanGroups.Add(clean);
        }
        cleanGroups.Sort(delegate(Dictionary<string, object> a, Dictionary<string, object> b) { return StringComparer.Ordinal.Compare((string)a["id"],(string)b["id"]); });
        var result = new Dictionary<string, object> { {"version",1}, {"nextId",(int)nextId}, {"groups",cleanGroups.ToArray()} };
        return Extensions(catalog,result,"version","nextId","groups") ? result : null;
    }

    public static List<GroupLabel> CleanLabels(object raw, Dictionary<string, object> catalog)
    {
        var labels = raw as IList;
        if (labels == null || labels.Count > 500) return null;
        var active = new HashSet<string>(StringComparer.Ordinal);
        if (catalog != null)
            foreach (Dictionary<string, object> group in (IList)catalog["groups"])
                if ((bool)group["active"]) active.Add((string)group["id"]);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var clean = new List<GroupLabel>();
        foreach (object value in labels)
        {
            var label = value as Dictionary<string, object>;
            if (!SafeObject(label)) continue;
            string id = Get(label,"id") as string, text = Get(label,"text") as string;
            PhysicalRect rect, editRect;
            if (!SafeId(id) || text == null || (catalog != null && !active.Contains(id))
                || !TryRect(Get(label,"rect"),out rect) || !seen.Add(id)) continue;
            var item = new GroupLabel { Id = id, Text = PlainText(text), Rect = rect, HasExplicitEditRect = label.ContainsKey("editRect") };
            // An explicit zero/invalid editRect means keep the label, but NO hit area.
            if (TryRect(Get(label,"editRect"),out editRect) && editRect.Width == 24 && editRect.Height == 24) item.EditRect = editRect;
            clean.Add(item);
        }
        return clean;
    }

    public static bool Same(object left, object right)
    {
        if (ReferenceEquals(left, right)) return true;
        var a = left as Dictionary<string, object>;
        var b = right as Dictionary<string, object>;
        if (a != null && b != null)
        {
            if (a.Count != b.Count) return false;
            foreach (var pair in a)
                if (!b.ContainsKey(pair.Key) || !Same(pair.Value, b[pair.Key])) return false;
            return true;
        }
        var aa = left as IList;
        var bb = right as IList;
        if (aa != null && bb != null)
        {
            if (aa.Count != bb.Count) return false;
            for (int i = 0; i < aa.Count; i++) if (!Same(aa[i], bb[i])) return false;
            return true;
        }
        return object.Equals(left, right);
    }
}

static class DesktopEditGeometry
{
    static bool Intersects(PhysicalRect a, PhysicalRect b)
    {
        return a.X < b.X + b.Width && a.X + a.Width > b.X && a.Y < b.Y + b.Height && a.Y + a.Height > b.Y;
    }

    public static bool OverlapsIcon(PhysicalRect button, IconGlyph icon)
    {
        // Reserve a conservative filename cell without reading any item text.
        return Intersects(button, new PhysicalRect(icon.Left - 48, icon.Top - 4,
            icon.Right - icon.Left + 96, icon.Bottom - icon.Top + 84));
    }

    public static PhysicalRect? ButtonRect(GroupLabel label, int width, int height, IList<IconGlyph> icons, IList<PhysicalRect> occupied)
    {
        if (label == null || width <= 0 || height <= 0) return null;
        bool explicitArea = label.HasExplicitEditRect || label.EditRect.HasValue;
        if (explicitArea && !label.EditRect.HasValue) return null;
        PhysicalRect button = label.EditRect ?? new PhysicalRect(label.Rect.X + label.Rect.Width + 4,
            label.Rect.Y + (label.Rect.Height - 24) / 2, 24, 24);
        // Never relocate an explicit unsafe pencil: this could steal Explorer clicks.
        if (button.Width != 24 || button.Height != 24 || double.IsNaN(button.X) || double.IsNaN(button.Y)
            || button.X < 0 || button.Y < 0 || button.X + 24 > width || button.Y + 24 > height) return null;
        foreach (IconGlyph icon in icons) if (OverlapsIcon(button,icon)) return null;
        foreach (PhysicalRect other in occupied) if (Intersects(button,other)) return null;
        return button;
    }
}

sealed class GroupStateSession
{
    public string Theme { get; private set; }
    public Dictionary<string, object> Catalog { get; private set; }
    public List<GroupLabel> Labels { get; private set; }
    public bool CatalogChanged { get; private set; }

    public GroupStateSession() { Labels = new List<GroupLabel>(); }

    public void Clear()
    {
        Theme = null;
        Catalog = null;
        Labels = new List<GroupLabel>();
        CatalogChanged = false;
    }

    public bool TryRename(string theme, string id, string text, Dictionary<string, object> settings, out Dictionary<string, object> names)
    {
        names = null;
        if (theme != Theme || text == null || !GroupStateRules.SafeId(id)) return false;
        bool labelled = false;
        foreach (GroupLabel label in Labels) if (label.Id == id) { labelled = true; break; }
        if (!labelled) return false;
        var catalog = GroupStateRules.CleanCatalog(GroupStateRules.Get(settings,"groupCatalog"));
        if (catalog != null)
        {
            bool active = false;
            foreach (Dictionary<string, object> group in (IList)catalog["groups"])
                if ((string)group["id"] == id && (bool)group["active"]) { active = true; break; }
            if (!active) return false;
        }
        var saved = GroupStateRules.Get(settings,"groupNames") as Dictionary<string, object>;
        string clean = GroupStateRules.PlainText(text);
        if ((GroupStateRules.Get(saved,id) as string ?? "") == clean) return false;
        // Only the explicitly edited ID changes; preserve every other saved name.
        names = saved == null ? new Dictionary<string, object>() : new Dictionary<string, object>(saved, StringComparer.Ordinal);
        if (clean.Length == 0) names.Remove(id);
        else names[id] = clean;
        return true;
    }

    public bool Accept(Dictionary<string, object> packet, string currentTheme, Dictionary<string, object> settings)
    {
        CatalogChanged = false;
        if (!GroupStateRules.SafeObject(packet) || string.IsNullOrEmpty(currentTheme)
            || GroupStateRules.Get(packet, "t") as string != "groupState"
            || GroupStateRules.Get(packet, "theme") as string != currentTheme) return false;
        var saved = GroupStateRules.CleanCatalog(GroupStateRules.Get(settings,"groupCatalog"));
        var catalog = packet.ContainsKey("catalog") ? GroupStateRules.CleanCatalog(packet["catalog"]) : saved;
        if (packet.ContainsKey("catalog") && catalog == null) return false;
        var clean = GroupStateRules.CleanLabels(GroupStateRules.Get(packet,"labels"),catalog);
        if (clean == null) return false;
        CatalogChanged = packet.ContainsKey("catalog") && !GroupStateRules.Same(catalog,saved);
        Catalog = catalog;
        Labels = clean;
        Theme = currentTheme;
        return true;
    }
}
