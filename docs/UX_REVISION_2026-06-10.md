# UX/UI Revision — lean build (sol2-lean), 2026-06-10

**Method:** live walkthrough on app.iqsport.ai (IPC South: Dashboard + KPI
drill-down, Schedule + Advise drawer, Programming Health, Membership Health,
Members, Billing, Coming Soon pages, dark + light themes) plus an 8-agent
code audit of every live surface (~60 findings). Where the two disagree, the
live observation wins.

**Context:** the lean build ships 7 live sections (Dashboard, Schedule,
Programming Health, Membership Health, AI Advisor, Members, Billing); the
rest are gated behind ComingSoonIQ. Full product preserved on branch
`deviq2`. See git log `a964071f..7bc8bf66` for everything shipped on
2026-06-10 (lean trim, Session Revenue card + MRR, Schedule Advise,
unified KPI row, mute hardening).

---

## Already fixed & deployed (commit `7bc8bf66`)

1. IQSidebar: Members nav item lit up on /membership-health (startsWith
   prefix collision) — segment-boundary match now.
2. Dashboard KPI tiles: thousands separator on the big value ("3190" next
   to "was 3,429").
3. AdvisorIQ: per-message debug console.log removed from prod.
4. Schedule Advise badge capped at "99+".

---

## P1 — needs a product decision / most user-visible

1. **Light theme is effectively broken (verified live).** The toggle changes
   almost nothing: hardcoded dark colors across all pages, modals/drawers on
   a dark-only `#0B0B14` fallback, undefined CSS vars (`--bg`, `--accent`).
   Options: (a) hide the Light Mode toggle on lean (~15 min, honest
   dark-only product) or (b) full token repair (~1 day). Recommendation:
   (a) now, (b) later. Details in per-surface findings below.
2. **Members: two dead columns for CR/membership clubs.** RATING is all
   zeros (CourtReserve sync carries no DUPR), REVENUE is all $0 (dues-based
   club). Hide both when `pricingModel === 'membership'` (already available
   via intelligence settings).
3. **Slow pages dim for 5–9 s with no skeleton** (Membership Health,
   Members, Billing) — looks like a hang. Dashboard already has the right
   skeleton pattern; extend it.
4. **Dead affordances:** header "Search anything… ⌘K" does nothing;
   permanently-disabled "Send campaign" in the Members bulk bar (references
   the unshipped wizard); PendingQueueCards copy mentions the retired
   "Agent page".

## P2 — noticeable warts

- **Mobile/tablet:** court grid min-width 520px forces horizontal scroll;
  date-picker popover overflows <400px viewports; Advisor conversation
  sidebar disappears on 768–1023px; chat bubbles too narrow on phones.
  (Defer if operators are desktop-only.)
- No focus states on Schedule controls; Esc doesn't close the
  notifications/profile dropdowns.
- Billing: AI Usage card silently disappears on query error.
- Settings: "Saved" lingers 3 s after new edits; OFF kill-switch looks
  decorative.
- Date format drift: drill-down header "5/11/2026 → 6/11/2026" vs dashboard
  caption "May 11–Jun 10, 2026".
- Members perf: unmemoized filter/map chains over 6,800 members per render.

## P3 — polish

Heading/label casing drift (Title Case vs sentence case), "bookings" vs
"sessions" terminology, background orbs anchored to the expanded sidebar
(`left: 260`), SOON chip contrast in light theme, native date inputs
unstyled.

**Verified good live:** unified KPI row + drill-down drawer, Advise drawer
verdicts (badge 27→19 after the equipment exclusion), Coming Soon screens,
SOON-chip nav, Programming/Membership Health — coherent in dark theme.

**Suggested fix order:** P1.1 (hide Light Mode) → P1.2 (Members columns) →
P1.3 (skeletons) → P1.4 (dead affordances) → P2 keyboard/focus sweep →
mobile as its own pass if needed.

---

## Full per-surface findings (8-agent code audit, file:line)

### dashboard

- **[HIGH] Unified KPI row – focus ring styling** — `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx:1257`
  - Focus ring hardcoded to 'focus:ring-purple-500/40' will fail in light theme where the purple tint is too dim against light backgrounds. The token should use theme-aware colors.
  - **Fix:** Change focus:ring-purple-500/40 to use both dark and light variants, or create a theme token var(--focus-ring) in iqsport-theme.css that adjusts per theme.
- **[HIGH] Period Comparison Drawer – hardcoded colors** — `app/clubs/[id]/intelligence/_components/iq-pages/dashboard/PeriodComparisonDrawer.tsx:229, 312, 329`
  - Multiple hardcoded colors (#8B5CF6 purple, #06B6D4 cyan) that ignore theme. These will contrast poorly in light theme where they appear as medium-tone colors on light backgrounds.
  - **Fix:** Replace hardcoded colors with theme tokens: create var(--accent-color) and var(--trend-line) in iqsport-theme.css for both dark and light blocks.
- **[MED] Business Insight Card – category colors not theme-aware** — `app/clubs/[id]/intelligence/_components/iq-pages/dashboard/BusinessInsightCard.tsx:80-89`
  - CATEGORY_META and SEVERITY_DOT use hardcoded colors (#A78BFA light purple, #60A5FA light blue) that are unreadable in light theme on white background. Poor contrast.
  - **Fix:** Create theme-specific palette tokens in iqsport-theme.css for each category and severity level with dark/light variants. Replace hardcoded hex values with token references.
- **[MED] KPI inline comparison – truncation on narrow screens** — `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx:1298`
  - The 'was X' value uses truncate in a flex row with delta badge. On mobile <320px or with large text, layout breaks because the delta badge competes for horizontal space, no responsive stacking.
  - **Fix:** Add responsive layout: change to flex-col sm:flex-row with gap-1 so delta badge stacks below 'was X' on mobile instead of competing for space.
- **[MED] Compare toolbar – responsive overflow** — `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx:1172-1198`
  - The caption paragraph (lines 1193-1198) doesn't break or shrink on mobile portrait. Can push entire 'Compare to' row off-screen on narrow viewports. No responsive text sizing.
  - **Fix:** Change outer container to flex-col lg:flex-row to stack on mobile. Add max-w-full and text-xs lg:text-[11px] to the caption paragraph for responsive sizing.
- **[MED] Unified KPI grid – 5-column breakpoint too aggressive** — `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx:1218`
  - Grid jumps from 3 to 5 columns at lg breakpoint (1024px+). On md tablets (768px), 3 columns is cramped. No comfortable 2-column tablet layout. The 5th Inactive Players card wraps awkwardly.
  - **Fix:** Change to grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-5 so tablets get 2-column breathing room. Or use xl:grid-cols-5 to push 5-column to >1200px.
- **[LOW] Copy – 'view in Members' inconsistent tone** — `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx:1291`
  - Inactive Players tile shows 'view in Members →' as lowercase label. Other tiles show 'was X' or 'pick baseline dates'. Inconsistent capitalization and tone breaks visual pattern of the comparison line.
  - **Fix:** Change to 'View in Members →' or better, align tone: 'Click to view member list' to match the instructional style of 'pick baseline dates'.
- **[LOW] Session Revenue Card – MRR label cut off on mobile** — `app/clubs/[id]/intelligence/_components/iq-pages/dashboard/SessionRevenueCard.tsx:151, 239, 241`
  - MRR block uses shrink-0 without responsive sizing. On mobile in the 2-column grid, the headline and subscriber count overflow the card width. No text wrapping for small screens.
  - **Fix:** Add responsive font sizes and wrap: text-lg sm:text-base for headline. Stack MRR to next line on mobile with flex-col sm:flex-row, or use text-xs on mobile for the /mo MRR label.
- **[LOW] Period Comparison Drawer – date format inconsistency** — `app/clubs/[id]/intelligence/_components/iq-pages/dashboard/PeriodComparisonDrawer.tsx:194`
  - Header uses system locale toLocaleDateString() (e.g., 'M/D/YYYY' US, 'D/M/YYYY' EU) but chart labels use explicit 'en-US' format. Mixed locale conventions confuse users when comparing dates.
  - **Fix:** Use explicit locale in header: toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) to match chart bucket labels.
- **[LOW] Heatmap – day labels misaligned on overflow** — `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx:1594`
  - Day labels set to w-8 (32px). If locale uses longer names or timezone text is added, layout shifts. Minor but causes visual misalignment on very small screens.
  - **Fix:** Change w-8 to w-12 sm:w-8 to give mobile breathing room, or add truncate class if space is constrained.
- **[LOW] Empty state gradient – theme inconsistent** — `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx:162`
  - No-data onboarding icon uses hardcoded 'bg-gradient-to-br from-lime-500 to-green-600' instead of theme tokens. Will clash with light/dark theme appearance and look out of place.
  - **Fix:** Use theme tokens: replace with a style prop using var(--accent-color) or define --cta-gradient in iqsport-theme.css with dark and light variants.

### schedule

- **[HIGH] Date picker popover overflow on mobile** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:445-500`
  - Date picker positioned with `absolute right-0 top-11` but no overflow containment or viewport constraint. On mobile (<400px), the 300px-wide popover will overflow right edge of screen and be inaccessible.
  - **Fix:** Add `max-w-[calc(100vw-1rem)]` and position with `right-0 translate-x-[-min(0px,calc(100vw-100%))]` or use `left-0` positioning. Or wrap in a Portal/teleport to avoid parent overflow clipping.
- **[HIGH] Court grid minimum width forces horizontal scroll on mobile** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:565`
  - Grid minWidth hardcoded to `Math.max(520, courts.length * 112 + 54)` means on mobile with 1 court, grid is still 520px minimum, forcing horizontal scroll. No responsive breakpoint for tablets/mobile.
  - **Fix:** Reduce minimum width to 380px or use CSS `clamp(380px, 100%, 600px)`. Or collapse to a vertical session list on mobile (<640px) instead of grid.
- **[HIGH] Week pills scrolling on mobile not obvious** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:529-552`
  - Week day pills container has `overflow-x-auto` but on mobile with 7 days × 44px min-width buttons, horizontal scrolling is required and not signaled (no scrollbar on iOS, no visual affordance or scroll-snap).
  - **Fix:** Add `pb-2` for iOS scrollbar room. Add CSS scroll-snap (`scroll-snap-type: x mandatory`) or gradient fade indicator on right edge.
- **[MED] Weak session amber ring low contrast on skill-tier backgrounds** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:665`
  - Weak indicator ring uses `rgba(245,158,11,0.5)` (50% opacity amber) overlaid on skill-tier backgrounds (e.g., `rgba(16,185,129,0.15)` green for Beginner). Contrast fails WCAG AA on light backgrounds; amber barely visible on green/cyan tiers.
  - **Fix:** Use `rgba(245,158,11,0.8)` (80% opacity) for ring, or switch to a 2px solid border to leverage independent border contrast.
- **[MED] Missing focus/active states on all interactive buttons** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:420-443, 457-473, 509-525, 656-693`
  - Navigation buttons (chevrons, date picker toggle, session cards) have only `hover:opacity-70` with no `focus:ring` or `:focus-visible`. Keyboard users cannot see which element is focused.
  - **Fix:** Add `focus:ring-2 focus:ring-violet-500/40 focus:outline-none` class to all `<button>` elements for WCAG keyboard accessibility.
- **[MED] Advise badge counter overflow at 10+** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:516-524`
  - Badge has fixed `min-w-[18px] h-[18px]` with `text-[10px]`. For weakWeekCount >= 10, text overflows (e.g., '99' is ~12px wide). No '99+' logic or dynamic sizing.
  - **Fix:** Cap display: `weakWeekCount > 99 ? '99+' : weakWeekCount`. Or increase `min-w-[24px]` and shrink to `text-[9px]`.
- **[MED] ScheduleAdviceDrawer verdict colors fail light-theme contrast** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleAdviceDrawer.tsx:72-74`
  - VERDICT_META hardcodes `#94A3B8` (slate-400) text for 'review' verdict on `rgba(148,163,184,0.08)` light-gray background. In light theme, contrast is <3:1, failing WCAG AA. High/medium verdicts also use hardcoded amber/red without light-theme variants.
  - **Fix:** Use CSS variables (`var(--t3)` and `var(--t2)`) or add theme-aware color map. Light-theme 'watch' verdict should use `#64748B` (slate-600).
- **[MED] SessionDetailIQ FillSessionButton modal height unconstrained on mobile** — `app/clubs/[id]/intelligence/_components/iq-pages/SessionDetailIQ.tsx:501-505`
  - Modal uses `max-w-2xl` but no `max-h-` constraint or guaranteed scroll handling. On portrait mobile, modal body may exceed viewport height with no way to scroll content.
  - **Fix:** Add `max-h-[calc(100vh-2rem)]` to motion.div (line 502). Ensure inner px-6 py-5 container has `overflow-y-auto` for long content.
- **[LOW] Date formatting timezone inconsistency** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleAdviceDrawer.tsx:40`
  - `dayShort()` uses `timeZone: 'UTC'` but ScheduleIQ.tsx date formatting uses implicit local timezone. May show date mismatches if sessions cross midnight UTC.
  - **Fix:** Remove `timeZone: 'UTC'` to use local timezone consistently across both files. Add comment if UTC is intentional.
- **[LOW] ScheduleAdviceDrawer close button missing focus affordance** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleAdviceDrawer.tsx:149`
  - Close button (X icon) has `hover:opacity-70` but no `focus:ring`. Keyboard users won't see focus state.
  - **Fix:** Add `focus:ring-2 focus:ring-violet-500/40 focus:outline-none` to button className.
- **[LOW] Empty session state timing unclear** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:557-561`
  - Empty state shows 'No sessions scheduled for this day' without distinguishing 'no data loaded yet' from 'legitimately empty'. Shown whenever `daySessions.length === 0`, even during initial load.
  - **Fix:** Add `!isLoading` guard: only show empty state when `!isLoading && daySessions.length === 0`. Show skeleton during load.
- **[LOW] Session title truncation conflicts with tier tooltip** — `app/clubs/[id]/intelligence/_components/iq-pages/ScheduleIQ.tsx:680-682, 669`
  - Session cell has two tooltips: `title={tierMeta.label...}` (line 669) and truncated title text (line 680). User can't read full session title if text exceeds cell width; title attr shows tier instead.
  - **Fix:** Merge tooltips or move full title display to SessionDetailIQ click handler. Use single, clear title: `${title} · ${tierMeta.label}`

### members

- **[HIGH] Bulk Select Toolbar / Send Campaign Button** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:3035-3043`
  - Disabled 'Send campaign' button is permanently broken and visible to users. Button has `disabled` attribute with opacity-50, making it a dead affordance. Tooltip references 'P4-T1' (Campaign Wizard), but button text still shows as actionable.
  - **Fix:** Either (a) wrap entire button in conditional `{false && ...}` to fully hide until P4-T1 ships, or (b) replace with a Coming Soon placeholder card (like AIInsightRibbon pattern). Current state creates UX confusion — button looks clickable but isn't.
- **[HIGH] Hardcoded Hex Colors vs Theme Tokens (MembersIQ)** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:68-72, 76-79, 83-86, 114-122, 526-587`
  - Extensive hardcoded hex colors (#8B5CF6, #06B6D4, #10B981, #F59E0B, #EF4444, etc.) in segmentConfig, activityColors, trendColors, normalizedMembershipStatusStyles, and stage/lane/offer style objects. These don't respect light/dark theme switches defined in iqsport-theme.css. Dark theme hardcoding breaks contrast in light mode—segment badges, membership status badges will be unreadable.
  - **Fix:** Replace inline color objects with CSS variables or computed values from useTheme(). E.g., change `color: '#8B5CF6'` to `color: isDark ? '#C4B5FD' : '#7C3AED'`. Prioritize: segment badges (68-72), membership status styles (114-122), offer/lane styles (526-587).
- **[HIGH] MembersFilterDrawer Hardcoded Colors & Theme** — `app/clubs/[id]/intelligence/_components/MembersFilterDrawer.tsx:150-164, 461`
  - Chip active state forces hardcoded purple pill (#8B5CF6 / rgba variants, line 151/164) with manual isDark ternary. Footer button gradient hardcoded: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' (line 461) breaks in light theme. Active pill text color (#C4B5FD / #7C3AED) doesn't match light theme palette. No use of var(--pill-active) CSS variable.
  - **Fix:** Use CSS variable var(--pill-active) for background; replace hardcoded text colors with theme-computed values. Footer gradient should pull from theme palette or be a CSS variable. Test in light mode for WCAG AA contrast.
- **[HIGH] Unmemoized .filter() & .map() Over 6800 Members** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:1524-1529, 1639-1651, 2023, 2032, 2234, 2269, 2369, 2530`
  - Multiple unmemoized filters run on every render: preset counts (1524-1529), audience segment counts (1639-1651), atRiskCount in view tabs (2023), tabs.map (2032), sort options.map (2269), paginated list maps (2369, 2530). With 6800+ members, each render triggers O(n*k) operations. Causes jank on filter/sort changes.
  - **Fix:** Wrap in useMemo(): const presetCounts = useMemo(() => ({atRisk: allMembers.filter(...), ...}), [allMembers]). Apply to: preset counts, audience segment counts, tabs, sort options. Prioritize: preset counts (1524-1529) and audience segments (1639-1651).
- **[MED] Responsive Text Overflow: Member Names & Email** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:2386, 2419, 2568`
  - Email field uses hardcoded max-w-[200px] (2419) instead of responsive breakpoint. On mobile (<640px), email truncates at 200px fixed width. Membership type/status at 2419 has title tooltip only—no visible indication of overflow. Member names use truncate but no responsive width constraints.
  - **Fix:** Change max-w-[200px] to responsive: sm:max-w-[200px] max-w-[100px]. Add truncate + title to membership type/status display. Test on mobile (iPhone portrait) with long emails and tier names.
- **[MED] Modal Backdrop & Z-Index Stacking** — `app/clubs/[id]/intelligence/_components/MembersFilterDrawer.tsx:299-315`
  - Backdrop hardcoded rgba(0,0,0,0.45) ignores theme. Z-index values (60 backdrop, 70 drawer) may conflict with MemberDetailDrawer or other modals on the same page. No documented z-index stacking context. If multiple modals open simultaneously, scroll locks may conflict.
  - **Fix:** Use theme variable for backdrop (e.g., var(--overlay) or rgba(0,0,0,0.3) in light mode). Document z-index strategy: filter-drawer=70, detail-drawer=80, etc. Centralize scroll-lock logic in a context to prevent conflicts.
- **[MED] Empty State & Error Handling** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:1970-1971`
  - Empty state shown only when !hasData && !externalLoading (line 1970). If data fetch fails silently, users see blank page or forever-loading spinner. No error boundary; no explicit error message UI from tRPC hook.
  - **Fix:** Add error state from tRPC hook: if (error && !externalLoading) return <EmptyStateIQ icon={AlertTriangle} title='Failed to load members' />. Wrap in error boundary or handle hook errors explicitly.
- **[MED] SaveAsCohortButton Dead Code** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:3060-3070`
  - SaveAsCohortButton returns null (3070) because cohortsGated=true hardcoded. Component is called but no-op. Comment says 'Flip cohortsGated to false when Cohorts ships' but task ID not referenced—left as ad-hoc TODO.
  - **Fix:** Extract cohortsGated as module constant or env variable. Or wrap call in conditional: {!cohortsGated && <SaveAsCohortButton ... />}. Replace TODO comment with actual task ID (e.g., P3-T1).
- **[MED] MembersReactivationSection Hardcoded Colors** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersReactivationSection.tsx:36, 49-51, 159, 213-215, 226, 255, 266, 269, 278`
  - Risk badge colors hardcoded (rgba variants for #EF4444, #F59E0B, #10B981). Health bar color ternary (line 36) hardcoded. Risk gradient backgrounds (213-215) hardcoded. Sparkles icon #A78BFA hardcoded. No isDark checks—contrast may fail in light theme.
  - **Fix:** Use computed theme colors: const riskColors = isDark ? {...} : {...}. Replace hardcoded hex with theme-aware ternaries. Test light mode contrast (WCAG AA).
- **[LOW] Date Format Inconsistency** — `app/clubs/[id]/intelligence/_components/iq-pages/PlayerProfileIQ.tsx:155-175`
  - Week range formatting uses compact 'Mar 23–29' but cross-month boundaries widen to 'Mar 27 – May 3'. Inconsistent with other date displays (lastPlayed: 'Today', 'Yesterday', 'Xd ago'). Date string parsing appends T12:00:00 to avoid timezone drift but format logic is complex (fmtDay ternary at 162).
  - **Fix:** Create shared dateRangeFormatter(startStr, endStr) helper. Standardize: always use 'MMM D–D' within month, 'MMM D – MMM D' across months. Add unit tests for edge cases (month/year boundaries, single-day ranges).
- **[LOW] Missing Cursor Affordance on Clickable Names** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:2386, 2568`
  - Member name spans render as text (truncate class only) without cursor-pointer or hover underline. SegmentBadge correctly uses cursor-help (line 1160) but clickable member names don't indicate interactivity. Users expect static text, not a link.
  - **Fix:** Add cursor-pointer hover:underline to member name spans. Or replace span with button/Link semantic HTML. Ensure visual feedback on hover (underline or highlight).
- **[LOW] Copy: Inconsistent Terminology** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:1990, 2352, 2358, 2964, 3092`
  - Mixed terminology: 'Members' (header 1990) vs 'member base' (1637), 'Add to cohort' (2964) vs 'Save as Cohort' (3092), 'Open in Cohorts' vs potential 'Open in Segments'. No consistent naming convention for cohort operations or member groups.
  - **Fix:** Standardize globally: pick 'Cohorts' vs 'Segments' (if renamed), use 'Create cohort' / 'Add to cohort' / 'Save as cohort' consistently. Document terminology in style guide or CLAUDE.md. Update all UI copy.
- **[LOW] Number Formatting: Missing Currency Symbol** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:2588`
  - Revenue displayed with .toLocaleString() but no currency symbol prefix. Code adds '$' but no locale-specific currency formatting (e.g., '€' for EU). Large numbers (>1M) may add commas inconsistently across locales.
  - **Fix:** Create currencyFormatter(value, locale='en-US', currency='USD') helper: `${new Intl.NumberFormat(locale, {style: 'currency', currency}).format(value)}`. Use consistently for revenue/LTV/budget displays. Add tests for 1K, 1M, edge cases.
- **[LOW] Icon Color Strategy Inconsistency** — `app/clubs/[id]/intelligence/_components/iq-pages/MembersIQ.tsx:2006, 2139, 2301`
  - Icon colors styled inconsistently: Insights button icon inherits from text (no explicit color), Agent action icons use var(--heading) (2139), View mode toggle icons inherit from parent. No centralized icon color strategy. Makes theme switching harder.
  - **Fix:** Define iconColor = isDark ? ... : ... at component top. Apply consistently via style={color: iconColor}. Or create .icon utility class with theme variable. Standardize across all icon usage.

### advisor

- **[HIGH] AdvisorIQ chat messages** — `app/clubs/[id]/intelligence/_components/iq-pages/AdvisorIQ.tsx:1192-1195`
  - Debug console.log left in production code at message render loop. Will spam browser console for every AI message rendered, creating noise and potentially impacting performance on high-volume chats.
  - **Fix:** Remove the console.log block (lines 1192-1195) that logs '[AdvisorIQ msg ${msgIdx}]' for each message.
- **[HIGH] ChatWidget floating button & panel z-index and mobile overflow** — `app/clubs/[id]/intelligence/_components/ChatWidget.tsx:484, 508`
  - ChatWidget uses fixed z-50 for both launcher and panel with no offset between them. On mobile with stacked modals, button and panel may render behind other UI elements. Panel width defaults to 400px on viewports smaller than 448px causing overflow on small phones.
  - **Fix:** Use z-50 for launcher, z-[51] for panel. Add responsive width constraint: max-w-[calc(100vw-48px)] on mobile to prevent horizontal overflow.
- **[MED] PendingQueueCards removed feature reference** — `app/clubs/[id]/intelligence/_components/iq-pages/PendingQueueCards.tsx:93, 156`
  - References 'Agent page' in sol2-lean build where Agent page is not shipped. Creates dead link in UI. Text appears twice in component.
  - **Fix:** Replace both instances from 'open the Agent page' to 'manage in settings' or conditionally hide pending queue upsell if Agent page does not exist.
- **[MED] Clarification card hardcoded colors** — `app/clubs/[id]/intelligence/_components/iq-pages/AdvisorIQ.tsx:422, 431, 456, 523, 545`
  - Cyan hardcoded hex colors (#06B6D4, #0891B2, #C4B5FD) not using theme tokens. Works in dark mode only; fails contrast and does not adapt to light theme dynamically.
  - **Fix:** Replace with theme variables or isDark ternaries. Map #06B6D4 to cyan token, #C4B5FD to computed accent. Test in light theme with contrast checker.
- **[MED] Sidebar responsive layout** — `app/clubs/[id]/intelligence/_components/iq-pages/AdvisorIQ.tsx:998-1000`
  - Sidebar hidden at 'hidden lg:flex' (1024px breakpoint). On tablets 768-1023px, sidebar disappears with no way to switch conversations. Users lose conversation context.
  - **Fix:** Show sidebar as collapsible drawer on md: and below. Add 'Conversations' toggle button to hide/show sidebar on tablet and mobile.
- **[MED] Message bubbles narrow on mobile** — `app/clubs/[id]/intelligence/_components/iq-pages/AdvisorIQ.tsx:1216`
  - Message max-width locked to 75% on all viewports. On mobile smaller than 375px, creates ~280px columns with excessive line breaks and poor readability.
  - **Fix:** Use responsive widths: md:max-w-[75%] lg:max-w-[60%], and full width on mobile. Let suggestion chips wrap naturally.
- **[MED] Extensive hardcoded gradient and border colors** — `app/clubs/[id]/intelligence/_components/iq-pages/AdvisorIQ.tsx:1025-1026, 1068, 1093-1094, 1115, 1136-1137, 1212-1213`
  - Hardcoded rgba and hex colors (#8B5CF6, #06B6D4, rgba values) for gradients, borders, text instead of theme tokens. Dark-mode-only; light theme lacks duplicate style blocks.
  - **Fix:** Extract to iqsport-theme.css as token variables (--gradient-primary, --border-action). Use isDark ternaries only for icon colors. Test both themes end-to-end.
- **[MED] ChatWidget localStorage drag persistence** — `app/clubs/[id]/intelligence/_components/ChatWidget.tsx:342-358, 410`
  - Widget anchor position saved to localStorage without re-clamping against current viewport on load. If user resizes or changes display after dragging to corner, widget could load off-screen. Drag detection threshold (4px) undocumented and may cause accidental drags on touch.
  - **Fix:** Re-clamp position against current viewport before setState on localStorage load. Document 4px hypot threshold. Test drag on touch devices to ensure single-taps do not trigger drag.
- **[LOW] Declined/Snoozed state card colors** — `app/clubs/[id]/intelligence/_components/iq-pages/AdvisorActionCard.tsx:684-686`
  - Gray background (rgba(148,163,184,0.08)) used for declined/snoozed cards regardless of theme. Light theme has insufficient contrast on white background.
  - **Fix:** Add isDark check to background. Use isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.04)' and increase border opacity for light mode.
- **[LOW] Recommendation card light theme contrast** — `app/clubs/[id]/intelligence/_components/iq-pages/AdvisorActionCard.tsx:812-814`
  - Agent recommendation card uses fixed green (rgba(16,185,129,0.08)) without theme check. Insufficient contrast on light background.
  - **Fix:** Add isDark ternary: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.04)'. Increase border opacity to 0.3 for light mode.
- **[LOW] AILoadingAnimation dark-only colors** — `app/clubs/[id]/intelligence/_components/iq-pages/AILoadingAnimation.tsx:132, 136, 151, 170, 186, 190, 202, 212-223`
  - All hardcoded dark colors (#8B5CF6, #06B6D4, #080A14 background). Component ignores IQThemeProvider context and is invisible in light theme.
  - **Fix:** Import useTheme(). Switch background to isDark ? '#080A14' : '#F7F8FC'. Update text and glow colors to use --t1, --t2 tokens. Test in light theme.

### health

- **[HIGH] Programming Dynamics Modal** — `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingDynamicsModal.tsx:120`
  - Modal uses undefined CSS variable --bg with fallback #0B0B14 (dark-only hardcoded color). This breaks light theme — the modal will always render with dark background regardless of theme toggle.
  - **Fix:** Change line 120 from `background: 'var(--bg, #0B0B14)'` to `background: 'var(--page-bg)'` which is properly defined in both dark and light theme blocks in iqsport-theme.css.
- **[HIGH] Membership Health — Member Charts Drawer** — `app/clubs/[id]/intelligence/_components/MembersChartsDrawer.tsx:138, 148`
  - Drawer uses undefined CSS variable --bg with fallback #0B0B14 (dark-only). Same issue as Programming Dynamics Modal — light theme will render dark backgrounds on the drawer.
  - **Fix:** Change lines 138 and 148 from `'var(--bg, #0B0B14)'` to `'var(--page-bg)'` for proper theme support.
- **[HIGH] Programming Health — Period Selector Pills** — `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingHealthIQ.tsx:146, 158, 192`
  - Period preset pills and Apply button use undefined CSS variable --accent with hardcoded fallback #A855F7. Since --accent is never defined in iqsport-theme.css, the fallback is always used regardless of theme, preventing theme-aware styling.
  - **Fix:** Either: (a) Add --accent token to both dark and light blocks in iqsport-theme.css, or (b) Replace 'var(--accent, #A855F7)' with a hardcoded color if intent is brand-specific. Current pattern breaks theme design system.
- **[HIGH] Membership Health — Tier Card Verdict Badge & Treatment Card** — `app/clubs/[id]/intelligence/_components/iq-pages/MembershipHealthIQ.tsx:176, 229, 233`
  - Treatment card and verdict badge backgrounds use hardcoded rgba(139,92,246,...) (purple) which is never defined as a CSS token. The color won't adapt to light theme color palette where purple should have different opacity/hue for readability.
  - **Fix:** Extract rgba(139,92,246,0.08), rgba(139,92,246,0.06), rgba(139,92,246,0.18), and #8B5CF6 to theme tokens (e.g., --treatment-bg-dark, --treatment-border, --treatment-accent) in both dark and light blocks.
- **[MED] Programming Health — KPI Tiles** — `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingHealthIQ.tsx:423-424`
  - Green accent tile uses hardcoded #10B981 and rgba(16,185,129,0.06) color. While this color works in both themes, it's inconsistent with the theme token pattern used everywhere else.
  - **Fix:** Add --accent-green and --accent-green-bg tokens to iqsport-theme.css for both themes, and use var(--accent-green) instead of hardcoded #10B981.
- **[MED] Programming Health — Date Input (Custom Range)** — `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingHealthIQ.tsx:171-187`
  - Native <input type="date" /> elements don't have styling rules in iqsport-theme.css. The calendar picker UI will use browser defaults, creating stark contrast between system calendar and dark app in dark mode.
  - **Fix:** Add ::-webkit-calendar-picker-indicator and input[type="date"] styles to iqsport-theme.css to theme-aware the date picker appearance.
- **[MED] Programming Health — Grid Layout Responsiveness** — `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingHealthIQ.tsx:216`
  - KPI tiles use 'grid grid-cols-3' with no responsive breakpoints. On tablet/mobile, three columns stack awkwardly without adaptation.
  - **Fix:** Change line 216 from 'grid grid-cols-3 gap-3' to 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'.
- **[MED] Membership Health — StatTile Color Handling** — `app/clubs/[id]/intelligence/_components/iq-pages/MembershipHealthIQ.tsx:83`
  - StatTile uses inconsistent color patterns: some pass explicit hex colors, others rely on fallback var(--heading). This makes the component less predictable.
  - **Fix:** Standardize: always pass explicit color parameter or always use var(--heading). Document the expected color format.
- **[LOW] Programming Health — Insight 'See family' Link** — `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingHealthIQ.tsx:378-386`
  - Button lacks focus ring for keyboard navigation. Tab navigation won't show visible focus indicator.
  - **Fix:** Add 'focus:outline-none focus:ring-2 focus:ring-offset-2' to className for keyboard accessibility.
- **[LOW] Membership Health — Tier Description Truncation** — `app/clubs/[id]/intelligence/_components/iq-pages/MembershipHealthIQ.tsx:266`
  - Tier description is hard-truncated to 280 characters without visual ellipsis indicator. Users won't know text continues.
  - **Fix:** Add '…' after truncated text if description.length > 280.

### billing-settings

- **[HIGH] Billing page — AI Usage card** — `app/clubs/[id]/intelligence/_components/iq-pages/BillingIQ.tsx:293`
  - AI Usage card only renders if usage data loads (conditional {usage && (...)}). If the API call fails or returns null, users see no usage information and no error message.
  - **Fix:** Add error state: show skeleton while loading, error card if usageQuery.isError is true.
- **[MED] Billing page — hardcoded colors** — `app/clubs/[id]/intelligence/_components/iq-pages/BillingIQ.tsx:41, 65, 86, 192-196, 229, 250, 255, 297, 351-354`
  - Plan/status colors (#06B6D4, #8B5CF6, #F59E0B, #10B981, #EF4444, #6B7280) hardcoded; do not respect dark/light theme vars.
  - **Fix:** Create color tokens in iqsport-theme.css (--status-success, --status-error, --status-warning) and use var(--*) instead of hex.
- **[MED] Settings page — dark mode contrast** — `app/clubs/[id]/intelligence/settings/page.tsx:684-705`
  - Chip and RadioOption borders too faint in dark mode (rgba(255,255,255,0.06)), hard to distinguish from static text.
  - **Fix:** Use var(--subtle) background or increase border opacity to rgba(255,255,255,0.15) when unselected.
- **[MED] Settings page — kill switch affordance** — `app/clubs/[id]/intelligence/settings/page.tsx:1847-1869`
  - When OFF (default), kill switch icon is muted gray on gray background—unclear that it's disabled and needs no action.
  - **Fix:** Keep red/amber styling when OFF for defensive UI, or add text '(Disabled — live actions allowed)'.
- **[MED] Settings page — save button z-index** — `app/clubs/[id]/intelligence/settings/page.tsx:2327-2351`
  - Sticky save button has no z-index; may be layered behind cards or overlap on narrow screens.
  - **Fix:** Add z-10 md:z-20 to sticky bar; test on mobile and tablet.
- **[MED] Settings page — save state timeout** — `app/clubs/[id]/intelligence/settings/page.tsx:1168-1169`
  - 'Saved' state persists for 3 seconds even after new edits, causing confusion about what is staged vs saved.
  - **Fix:** Call setSaved(false) in updateSettings, updateComms, updateAutomation callbacks.
- **[MED] Settings page — disabled automation opacity** — `app/clubs/[id]/intelligence/settings/page.tsx:1299`
  - When automation.enabled is false, opacity-50 grays toggles but Switch still appears interactive.
  - **Fix:** Add grayscale filter or pass disabled={!automation.enabled} to each Switch.
- **[LOW] Settings page — rule numbering** — `app/clubs/[id]/intelligence/settings/page.tsx:1356-1441`
  - Membership rules numbered 'Rule 1, 2, 3...' but renumber after deletion; no visual separator.
  - **Fix:** Add divider lines between rules or use rule.rawLabel in header for stable identity.
- **[LOW] Billing page — locale-dependent dates** — `app/clubs/[id]/intelligence/_components/iq-pages/BillingIQ.tsx:256, 261, 303`
  - toLocaleDateString() uses browser locale, may show DD/MM vs MM/DD; confusing for trial/billing dates.
  - **Fix:** Use toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) for consistent output.
- **[LOW] Import page — redirect path** — `app/clubs/[id]/intelligence/import/page.tsx:12`
  - Redirects to /clubs/${clubId}/intelligence/advisor; unclear if route exists or is intended onboarding path.
  - **Fix:** Redirect to /clubs/${clubId}/intelligence (dashboard) or verify advisor route exists.
- **[LOW] Settings page — tablet grid** — `app/clubs/[id]/intelligence/settings/page.tsx:1376, 2153-2189`
  - md:grid-cols-2 breakpoint is 768px+; tablets (600–750px) stack single column, form becomes very tall.
  - **Fix:** Use sm:grid-cols-2 breakpoint to allow 2-column layout on tablets.

### shell

- **[HIGH] Orbs positioning / Theme responsiveness** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:700`
  - Orbs div uses hardcoded `left: 260` which assumes expanded sidebar. When sidebar collapses to 72px, orbs don't adjust, leaving blank space on left and wrong positioning on light theme where orb opacity is already very subtle.
  - **Fix:** Replace hardcoded `left: 260` with `left: expanded ? 260 : 72` via inline state or CSS custom property, or use `left: 0` and adjust width calculation. Test orb visibility on light theme — they may be invisible.
- **[MED] Search field / Top bar** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:440-444`
  - Search input displays '⌘K' in placeholder but has no keyboard handler or onClick to open a search dialog. Dead affordance — users will click expecting functionality.
  - **Fix:** Either (a) remove the ⌘K from placeholder to signal it's read-only, (b) implement Cmd+K handler to open a search modal, or (c) add readonly attribute and aria-label='Search is coming soon'
- **[MED] Modal/Dropdown keyboard handling** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:479-579, 597-691`
  - Notifications and Profile dropdowns do not handle Escape key to close. Users must click the backdrop or a menu item. Modern UX expectation is Escape closes modals. Users on mobile/touch won't have easy backdrop access.
  - **Fix:** Add useEffect with onKeyDown handler: `if (e.key === 'Escape') setNotificationsOpen(false)`. Attach to `<div onKeyDown={...}>` wrapping the portal or to window.
- **[MED] Collapsed sidebar buttons / Accessibility** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:317-356`
  - Bottom sidebar buttons (Theme toggle, Settings, Collapse) hide their labels when sidebar is collapsed but have no title or aria-label attributes. Icon-only buttons without labels are inaccessible; screen reader users won't know what they do.
  - **Fix:** Add title attribute (e.g. title='Light Mode') to each button, or add aria-label. Example: `<button title='Toggle light/dark mode' ...>`
- **[MED] Notifications dropdown positioning** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:483`
  - Notifications dropdown is hardcoded `right-16` position, which doesn't account for mobile viewports. On mobile (< md breakpoint), it may overflow or position incorrectly since the button layout changes.
  - **Fix:** Change `right-16` to responsive: `md:right-16 sm:right-4` or calculate from button position dynamically. Also ensure `max-w-[calc(100vw-2rem)]` is sufficient.
- **[MED] SOON and AI chip styling consistency** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:282-303`
  - SOON chip uses neutral gray tones and low contrast on light theme (#64748B color on rgba(100,116,139,0.08) background = ~3.5:1 ratio, below WCAG AA). AI chip uses vibrant purple which is more readable. Inconsistent visual hierarchy.
  - **Fix:** Unify chip styling: use var(--pill-active) for background and increase contrast color. Example: SOON should use a more muted but readable palette. Or swap: use purple for SOON (it's more prominent feature) and gray for AI.
- **[MED] Light theme orb visibility** — `app/clubs/[id]/intelligence/iqsport-theme.css:86-88`
  - Light theme orbs are extremely subtle (rgba(124,58,237,0.03), (6,182,212,0.02)). On white/off-white backgrounds, they are nearly invisible. May as well not render them.
  - **Fix:** Increase opacity: `--orb-violet: rgba(124, 58, 237, 0.08);` (2.5x increase) and similar for cyan/emerald. Test visually on light theme.
- **[LOW] ComingSoonIQ / Mobile responsiveness** — `app/clubs/[id]/intelligence/_components/iq-pages/ComingSoonIQ.tsx:30-31`
  - `px-8` padding on small phones (< 384px width) will leave very little room. The icon and text may wrap awkwardly. `minHeight: '60vh'` may overflow on short viewports.
  - **Fix:** Add responsive padding: `px-4 md:px-8`. Consider `min-h-[50vh] md:min-h-[60vh]` for better mobile fit.
- **[LOW] ComingSoonIQ / Hardcoded colors** — `app/clubs/[id]/intelligence/_components/iq-pages/ComingSoonIQ.tsx:39-40, 43, 48, 68, 70`
  - Multiple hardcoded hex colors (#8B5CF6, rgba(139,92,246,...)) instead of using CSS variables from iqsport-theme.css. The badge background and icon color won't change between light/dark themes properly.
  - **Fix:** Replace hardcoded colors with var(--*) from iqsport-theme.css. Example: `color: 'var(--orb-violet)'` or define specific tokens for the Coming Soon state.
- **[LOW] Light theme logo text color** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:191`
  - Logo 'INTELLIGENCE' text color is hardcoded `#06B6D4` (cyan). On light theme background #F7F8FC, cyan readability is poor (~5:1 WCAG AA but visually light). Not explicitly broken but could be stronger.
  - **Fix:** Use a CSS variable like `color: var(--t2)` or define a specific --logo-accent-light variable in light theme block of iqsport-theme.css.
- **[LOW] Notification onClick handler** — `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx:525-528`
  - Notification item does `router.push(item.targetUrl)` without checking if targetUrl exists or is valid. Silent failure if null. No error boundary or fallback.
  - **Fix:** Add guard: `if (item.targetUrl) router.push(item.targetUrl);` or add error logging.
- **[LOW] Error page colors** — `app/clubs/[id]/intelligence/error.tsx:44, 53`
  - Error page uses hardcoded error-red (#f87171) for dev message and gradient buttons instead of theme CSS variables. Inconsistent with theme provider.
  - **Fix:** Use var(--t2) or create a --error-text variable in iqsport-theme.css. Button gradient #8B5CF6 is also hardcoded — extract to var(--gradient-primary) or similar.

### consistency

- **[HIGH] Colors: IQ Pages Hardcoded Colors vs Theme Vars** — `app/clubs/[id]/intelligence/_components/iq-pages/RevenueIQ.tsx:multiple instances with text-emerald-400, text-red-400, text-cyan-400`
  - IQ pages hardcode Tailwind color classes (text-emerald-400, text-red-400, text-cyan-400) instead of using theme vars. These don't respect dark/light mode toggle defined in iqsport-theme.css (--orb-violet, --orb-cyan, --t1, etc.). Inconsistent with theme var pattern used elsewhere (var(--heading)).
  - **Fix:** Replace hardcoded Tailwind colors with theme var equivalents. Create --accent-primary (cyan), --accent-success (emerald), --accent-danger (red) in iqsport-theme.css for both dark/light modes. Use inline style={{ color: 'var(--accent-primary)' }} instead of class-based color utilities.
- **[MED] Colors: Semantic Status Colors Inconsistent** — `app/clubs/[id]/intelligence/members/page.tsx:35-38 (healthy=emerald-700), advisor/page.tsx:296 (success=green-600)`
  - Members page uses emerald-700/600 for healthy/success states. Advisor page uses green-600/400 for same semantic. Sessions page hardcodes #10b981 (emerald). No unified green shade: emerald vs green inconsistent.
  - **Fix:** Standardize on emerald across all pages. Replace text-green-* with text-emerald-*. Define --health-critical (red), --health-at-risk (orange), --health-watch (amber), --health-healthy (emerald) in theme CSS.
- **[MED] Typography: Page Heading Size Hierarchy** — `app/clubs/[id]/intelligence/settings/page.tsx:1249 (text-xl h2), 1267 (text-lg CardTitle)`
  - Inconsistent h1/h2/h3 sizing: Settings page title 'Intelligence Settings' is text-xl (20px), but subsection titles inside are text-lg (18px). No explicit h1 element on Members/Billing/Scorecard pages. No standardized heading hierarchy.
  - **Fix:** Define: page h1 = text-2xl font-semibold, card h2 = text-lg font-semibold, subsection h3 = text-sm font-semibold. Apply consistently via HTML elements, not just Tailwind classes. Add h1 to all pages.
- **[MED] Typography: Form Label Casing** — `app/clubs/[id]/intelligence/settings/page.tsx:1284 (Enable AI Automation - Title Case), 1360 (Raw label - sentence case), 1411 (Canonical type - sentence case)`
  - Membership Mapping section uses sentence case ('Raw label', 'Where to match', 'Match mode') while Automation section uses Title Case ('Enable AI Automation', 'Campaign Triggers'). Inconsistent pattern.
  - **Fix:** Standardize all form labels to Title Case. Change: 'Raw label' → 'Raw Label', 'Canonical type' → 'Canonical Type', 'Where to match' → 'Where to Match'.
- **[MED] Terminology: Bookings vs Sessions** — `app/clubs/[id]/intelligence/members/page.tsx:74 (sortKey bookings)`
  - Members page calls metric 'Bookings' and sorts by 'lastPlayed', but Sessions calendar uses 'sessions' terminology. TypeScript schema uses 'PlaySessionBooking'. User-visible inconsistency.
  - **Fix:** Standardize terminology to 'Sessions' across all pages. Rename Members column header 'Bookings' → 'Sessions attended'. Keep backend type as PlaySessionBooking internally.
- **[LOW] Date Formats: Multiple Patterns** — `app/clubs/[id]/intelligence/sessions/page.tsx:59-72 (custom formatters), settings/page.tsx:1828 (toLocaleString with params), team/page.tsx:235 (toLocaleDateString)`
  - Sessions page uses custom formatDateShort() producing 'Mon, Jun 8', formatMonthYear() producing 'June 2026', formatWeekRange() producing 'Jun 8 – Jun 15'. Settings page audit uses different pattern 'Jun 8, 3:45 PM'. CampaignHistory uses 'en-GB' locale. No single source of truth.
  - **Fix:** Create app-wide date formatter in _hooks/use-date-format.ts exporting: formatSessionDate(date) → 'Mon, Jun 8', formatMonthYear(date) → 'June 2026', formatAuditTime(date) → 'Jun 8, 3:45 PM'. Use consistently across all pages.
- **[LOW] Border Radius: Card vs Button Inconsistency** — `app/clubs/[id]/intelligence/members/page.tsx:190 (rounded-md button), 333 (rounded-xl card), 506 (rounded-md component)`
  - Cards use rounded-xl (16px), inline buttons use rounded-md (8px), filter sections use rounded-lg. No clear scale: what size should each UI element be?
  - **Fix:** Define rounding scale: Card = rounded-xl, Button = rounded-lg, Small element = rounded-md. Document in design system and apply consistently to all new components.
- **[LOW] Spacing: Grid Gap Inconsistency** — `app/clubs/[id]/intelligence/members/page.tsx:215 (grid gap-4), 504 (grid gap-2)`
  - Metric cards grid uses gap-4, member component breakdown uses gap-2. No clear rule for when to use gap-2 vs gap-3 vs gap-4.
  - **Fix:** Define: Large metric grids = gap-4, Details grids = gap-3, Compact lists = gap-2. Apply consistently.
- **[LOW] Number Format: Currency Consistency** — `app/clubs/[id]/intelligence/sessions/page.tsx:227 ($${revenue.toLocaleString()})`
  - Good pattern: toLocaleString() is used correctly across pages. Minor issue: no explicit locale parameter, relies on browser default. Could vary across users.
  - **Fix:** Add explicit 'en-US' locale to all toLocaleString() calls: .toLocaleString('en-US'). Create currency formatter utility: formatCurrency(num) → '$' + num.toLocaleString('en-US').
- **[LOW] Cards: Border Style Consistency** — `app/clubs/[id]/intelligence/members/page.tsx:418 (border border-border/60), 524 (border border-red-100)`
  - Standard cards use border-border/60 (semantic), but error/alert cards hardcode color borders like border-red-100, border-blue-100. Inconsistent border treatment.
  - **Fix:** Use semantic border token for all cards: 'border border-border/60'. Create color-specific border utilities if needed: border-border-error (= border-red-100 in light, darker in dark mode).
- **[LOW] Empty States: Styling Inconsistency** — `app/clubs/[id]/intelligence/_components/empty-state.tsx:14-18`
  - EmptyState component uses fixed py-16 padding and h-14 w-14 icon. Some pages use it (Members, Sessions), others render custom empty prose (Advisor). Inconsistent UX.
  - **Fix:** Enforce EmptyState component usage across all pages. Add optional size prop for responsive icon sizing. Add variant prop for error/info/empty styling.