import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import './AdminLayout.css';

export default function AdminLayout() {
  const { user } = useAuth(); // Kukunin natin ang user para sa Header

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-wrapper">
        <header className="admin-header">
           <div className="header-search">
              {/* Pwedeng lagyan ng search block in the future */}
           </div>
           <div className="header-profile">
              <div className="hp-info">
                 <span className="hp-name">{user?.email || 'Admin'}</span>
                 <span className="hp-role">Administrator</span>
              </div>
              <div className="hp-avatar">
                 {user?.email?.charAt(0).toUpperCase() || 'A'}
              </div>
           </div>
        </header>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
