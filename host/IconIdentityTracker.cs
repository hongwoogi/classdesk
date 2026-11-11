// ClassDesk position-only icon identity. GPL-3.0; no Explorer item data is read.
using System;
using System.Collections.Generic;

struct IconGlyph
{
    public readonly int Left, Top, Right, Bottom;
    public IconGlyph(int left, int top, int right, int bottom)
    { Left = left; Top = top; Right = right; Bottom = bottom; }

    public static bool IsValid(int left, int top, int right, int bottom)
    {
        return left >= -1000000 && top >= -1000000 && right <= 1000000 && bottom <= 1000000
            && (long)right - left > 0 && (long)right - left <= 1024
            && (long)bottom - top > 0 && (long)bottom - top <= 1024;
    }
}

// Session-local, best-effort identity. Positions cannot distinguish replacement
// at the identical location; no filename/content identity is ever used.
sealed class IconIdentityTracker
{
    sealed class Entry
    {
        public IconGlyph Glyph;
        public string Id;
    }
    List<Entry> previous = new List<Entry>();

    static string Center(IconGlyph glyph)
    {
        return ((long)glyph.Left + glyph.Right).ToString(System.Globalization.CultureInfo.InvariantCulture)
            + ":" + ((long)glyph.Top + glyph.Bottom).ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    public string[] Update(IList<IconGlyph> glyphs, bool visible)
    {
        // Hiding icons is not a deletion: retain the last visible snapshot.
        if (!visible) return new string[0];
        if (glyphs == null || glyphs.Count > 4096) throw new ArgumentException("Invalid glyph snapshot");
        var ids = new string[glyphs.Count];
        for (int i = 0; i < glyphs.Count; i++)
        {
            IconGlyph glyph = glyphs[i];
            if (!IconGlyph.IsValid(glyph.Left, glyph.Top, glyph.Right, glyph.Bottom)) throw new ArgumentException("Invalid glyph");
        }
        var used = new bool[previous.Count];
        MatchExact(glyphs, ids, used, true);
        MatchExact(glyphs, ids, used, false);
        var oldRemaining = new List<int>();
        var newRemaining = new List<int>();
        var oldGlyphs = new List<IconGlyph>();
        for (int i = 0; i < previous.Count; i++)
        {
            oldGlyphs.Add(previous[i].Glyph);
            if (!used[i]) oldRemaining.Add(i);
        }
        for (int i = 0; i < ids.Length; i++) if (ids[i] == null) newRemaining.Add(i);
        if (oldRemaining.Count == 1 && newRemaining.Count == 1)
            ids[newRemaining[0]] = previous[oldRemaining[0]].Id;
        else
        {
            // Do not force ambiguous pairings. Only mutually unique nearest pairs
            // within 256 physical pixels qualify; matching is never list-index based.
            var nearestOld = new Dictionary<int, int>();
            foreach (int n in newRemaining) nearestOld[n] = Nearest(glyphs[n], oldGlyphs, oldRemaining);
            foreach (int o in oldRemaining)
            {
                int n = Nearest(previous[o].Glyph, glyphs, newRemaining);
                if (n >= 0 && nearestOld[n] == o) ids[n] = previous[o].Id;
            }
        }
        var next = new List<Entry>();
        for (int i = 0; i < glyphs.Count; i++)
        {
            if (ids[i] == null) ids[i] = "i-" + Guid.NewGuid().ToString("N");
            next.Add(new Entry { Glyph = glyphs[i], Id = ids[i] });
        }
        previous = next;
        return ids;
    }

    static int Nearest(IconGlyph glyph, IList<IconGlyph> candidates, List<int> indexes)
    {
        long best = long.MaxValue, second = long.MaxValue;
        int found = -1;
        foreach (int index in indexes)
        {
            IconGlyph other = candidates[index];
            long dx = (long)glyph.Left + glyph.Right - other.Left - other.Right;
            long dy = (long)glyph.Top + glyph.Bottom - other.Top - other.Bottom;
            long distance = dx * dx + dy * dy; // doubled physical centers; no rounding
            if (distance < best) { second = best; best = distance; found = index; }
            else if (distance < second) second = distance;
        }
        return best <= 512L * 512 && (second == long.MaxValue || second > best + 32L * 32) ? found : -1;
    }

    void MatchExact(IList<IconGlyph> glyphs, string[] ids, bool[] used, bool rectangle)
    {
        var oldBuckets = new Dictionary<string, List<int>>(StringComparer.Ordinal);
        var newBuckets = new Dictionary<string, List<int>>(StringComparer.Ordinal);
        for (int i = 0; i < previous.Count; i++) if (!used[i]) AddCenter(oldBuckets, MatchKey(previous[i].Glyph, rectangle), i);
        for (int i = 0; i < glyphs.Count; i++) if (ids[i] == null) AddCenter(newBuckets, MatchKey(glyphs[i], rectangle), i);
        foreach (var pair in newBuckets)
        {
            List<int> old;
            if (pair.Value.Count == 1 && oldBuckets.TryGetValue(pair.Key, out old) && old.Count == 1)
            { ids[pair.Value[0]] = previous[old[0]].Id; used[old[0]] = true; }
        }
    }

    static string MatchKey(IconGlyph glyph, bool rectangle)
    {
        return rectangle ? string.Format(System.Globalization.CultureInfo.InvariantCulture, "{0}:{1}:{2}:{3}",
            glyph.Left, glyph.Top, glyph.Right, glyph.Bottom) : Center(glyph);
    }

    static void AddCenter(Dictionary<string, List<int>> centers, string key, int index)
    {
        List<int> bucket;
        if (!centers.TryGetValue(key, out bucket)) centers[key] = bucket = new List<int>();
        bucket.Add(index);
    }
}
