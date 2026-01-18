import './globals.css'
import { ThemeProvider } from './contexts/ThemeContext'
import Nav from './components/Nav'

export const metadata = {
  title: 'EVM Tools',
  description: 'EVM transaction decoder and contract caller',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Nav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
