import { ProfileSection } from '@/components/settings/ProfileSection';
import { PortfoliosSection } from '@/components/settings/PortfoliosSection';
import { BrokersSection } from '@/components/settings/BrokersSection';
import { ExportSection, BackupSection, OverridesSection, DangerZone } from '@/components/settings/OwnershipSections';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-12">
      <h1 className="font-display text-2xl font-bold text-gray-900">
        Configurações
      </h1>
      <ProfileSection />
      <PortfoliosSection />
      <BrokersSection />
      <ExportSection />
      <BackupSection />
      <OverridesSection />
      <DangerZone />
    </div>
  );
}
