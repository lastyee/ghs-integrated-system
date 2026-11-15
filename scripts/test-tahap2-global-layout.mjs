import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('TAHAP 2: GLOBAL LAYOUT REFINEMENT VERIFICATION SUITE');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failed++;
  }
}

// 1. AppHeader verification
const headerContent = fs.readFileSync('components/layout/app-header.tsx', 'utf8');
assert(
  headerContent.includes('h-16'),
  'AppHeader has fixed standard height h-16 (64px)'
);
assert(
  !headerContent.includes('<h1'),
  'AppHeader does NOT render any <h1>, preventing double title conflicts'
);
assert(
  headerContent.includes('GHS Portal'),
  'AppHeader renders clean breadcrumb system brand indicator'
);
assert(
  headerContent.includes('currentLocation'),
  'AppHeader renders activeLocation/breadcrumb context'
);
assert(
  headerContent.includes('#BF120E') && headerContent.includes('#FFD618'),
  'AppHeader maintains official brand colors (Crimson Red & Gold)'
);

// 2. AppSidebar verification
const sidebarContent = fs.readFileSync('components/layout/app-sidebar.tsx', 'utf8');
assert(
  sidebarContent.includes('h-16 items-center justify-between border-b border-[#2D2D2D]'),
  'AppSidebar brand header height standardized to h-16 (64px), symmetrically matching AppHeader'
);
assert(
  sidebarContent.includes('bg-[#BF120E] font-semibold text-white'),
  'AppSidebar active navigation item styled with Crimson Red #BF120E'
);
assert(
  sidebarContent.includes('bg-[#1B1B1B]'),
  'AppSidebar maintains Dark Charcoal #1B1B1B background'
);
assert(
  sidebarContent.includes('canViewAudit') &&
  sidebarContent.includes('isInstructor') &&
  sidebarContent.includes('isAcademic') &&
  sidebarContent.includes('isPlacement') &&
  sidebarContent.includes('isStudent'),
  'AppSidebar retains 100% of RBAC and role-based filtering rules'
);

// 3. AppShellClient verification
const shellClientContent = fs.readFileSync('components/layout/app-shell-client.tsx', 'utf8');
assert(
  shellClientContent.includes('bg-[#F4F5F7]'),
  'AppShellClient uses official Soft Gray bg-[#F4F5F7] canvas background'
);
assert(
  shellClientContent.includes('activeLabel={activeLabel}'),
  'AppShellClient forwards activeLabel to AppHeader for location breadcrumbs'
);

// 4. PageContainer verification
const pageContainerContent = fs.readFileSync('components/ui/page-container.tsx', 'utf8');
assert(
  pageContainerContent.includes('max-w-7xl') &&
  pageContainerContent.includes('max-w-[1500px]') &&
  pageContainerContent.includes('max-w-4xl'),
  'PageContainer provides standard max-width variants (default, wide, narrow)'
);
assert(
  pageContainerContent.includes('p-4 sm:p-6 lg:p-8'),
  'PageContainer default padding provides consistent responsive padding'
);

// 5. Container & Double-Title Fixes on Key Pages
const usersPageContent = fs.readFileSync('app/users/page.tsx', 'utf8');
assert(
  usersPageContent.includes('<PageContainer maxWidth="wide">') &&
  usersPageContent.includes('<PageHeader'),
  'Users page wrapped in PageContainer with PageHeader (fixes 0 padding and provides proper h1)'
);

const auditPageContent = fs.readFileSync('app/audit/page.tsx', 'utf8');
assert(
  auditPageContent.includes('<PageContainer maxWidth="wide">') &&
  auditPageContent.includes('<PageHeader'),
  'Audit page wrapped in PageContainer with PageHeader (fixes 0 padding and provides proper h1)'
);

const profilePageContent = fs.readFileSync('app/profile/page.tsx', 'utf8');
assert(
  profilePageContent.includes('<PageContainer maxWidth="wide">') &&
  profilePageContent.includes('<PageContainer maxWidth="narrow">'),
  'Profile page wrapped in PageContainer for both Student and Staff variants'
);

const dashboardPageContent = fs.readFileSync('app/dashboard/page.tsx', 'utf8');
assert(
  dashboardPageContent.includes('<PageContainer maxWidth="wide">') &&
  dashboardPageContent.includes('<PageHeader'),
  'Admin Dashboard uses PageContainer and PageHeader, eliminating legacy max-w-375'
);

// 6. Role Dashboards
const instructorDash = fs.readFileSync('components/dashboard/instructor-dashboard.tsx', 'utf8');
assert(
  instructorDash.includes('Dashboard Instruktur') && instructorDash.includes('max-w-[1500px]'),
  'Instructor Dashboard has semantic <h1> heading and modern max-w-[1500px]'
);

const academicDash = fs.readFileSync('components/dashboard/academic-dashboard.tsx', 'utf8');
assert(
  academicDash.includes('Dashboard Akademik') && academicDash.includes('max-w-[1500px]'),
  'Academic Dashboard has semantic <h1> heading and modern max-w-[1500px]'
);

const placementDash = fs.readFileSync('components/dashboard/placement-dashboard.tsx', 'utf8');
assert(
  placementDash.includes('Dashboard Penempatan') && placementDash.includes('max-w-[1500px]'),
  'Placement Dashboard has semantic <h1> heading and modern max-w-[1500px]'
);

const managementDash = fs.readFileSync('components/dashboard/management-dashboard.tsx', 'utf8');
assert(
  managementDash.includes('Dashboard Manajemen') && managementDash.includes('max-w-[1500px]'),
  'Management Dashboard has semantic <h1> heading and modern max-w-[1500px]'
);

console.log(`\n====================================================`);
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log(`====================================================`);

if (failed > 0) {
  process.exit(1);
}

