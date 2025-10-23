import React from 'react';
import { useRouter } from 'next/router';

type ProjectLayoutProps = {
  projectId: string;
  title: string;
  category?: string;
  children: React.ReactNode;
};

const tabs = [
  { name: 'Overview', href: (projectId: string) => `/projects/${projectId}` },
  { name: 'Tasks', href: (projectId: string) => `/projects/${projectId}/tasks` },
  { name: 'Gantt Chart', href: (projectId: string) => `/projects/${projectId}/gantt` },
];

export function ProjectLayout({ projectId, title, category, children }: ProjectLayoutProps) {
  const router = useRouter();
  const currentPath = router.asPath;

  return (
    <div className="border-t border-gray-200">
      <header className="px-6 py-4 flex items-center space-x-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {category && (
          <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
            {category}
          </span>
        )}
      </header>
      <nav className="border-b border-gray-200 px-6">
        <ul className="flex space-x-8">
          {tabs.map(({ name, href }) => {
            const tabHref = href(projectId);
            const isActive = currentPath === tabHref || (name === 'Overview' && currentPath === `/projects/${projectId}/`);
            return (
              <li key={name}>
                <a
                  href={tabHref}
                  className={`inline-block py-3 border-b-2 ${
                    isActive
                      ? 'border-blue-600 text-blue-600 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  {name}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
