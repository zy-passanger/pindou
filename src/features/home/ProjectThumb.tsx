import { useEffect, useState } from 'react';
import type { ProjectSummary } from '@/core/model';
import { Icon } from '@/ui/Icon';

export function ProjectThumb({ project }: { project: ProjectSummary }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!project.thumbnail) {
      setUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(project.thumbnail);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [project.thumbnail]);

  if (url) return <img src={url} alt="" />;
  return (
    <span className="thumb-placeholder" aria-hidden="true">
      <Icon name="bead" />
    </span>
  );
}
