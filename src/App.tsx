import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './screens/Dashboard'
import Planning from './screens/Planning'
import Projecten from './screens/Projecten'
import ProjectDetail from './screens/ProjectDetail'
import Teams from './screens/Teams'
import Beschikbaarheid from './screens/Beschikbaarheid'
import Verlof from './screens/Verlof'
import ExternePartijen from './screens/ExternePartijen'
import Planningstemplates from './screens/Planningstemplates'
import TemplateEditorScherm from './screens/TemplateEditorScherm'
import Instellingen from './screens/Instellingen'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/projecten" element={<Projecten />} />
        <Route path="/projecten/:id" element={<ProjectDetail />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/beschikbaarheid" element={<Beschikbaarheid />} />
        <Route path="/verlof" element={<Verlof />} />
        <Route path="/extern" element={<ExternePartijen />} />
        <Route path="/templates" element={<Planningstemplates />} />
        <Route path="/templates/:id" element={<TemplateEditorScherm />} />
        <Route path="/instellingen" element={<Instellingen />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
