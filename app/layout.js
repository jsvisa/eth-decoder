import './globals.css'
import Nav from './components/Nav'

export const metadata = {
  title: 'EVM Tools',
  description: 'EVM transaction decoder and contract caller',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  )
}
