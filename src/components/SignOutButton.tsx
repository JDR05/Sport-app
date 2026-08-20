'use client'

// A form, not a link: signing out is a state change, so it belongs in a POST.
// A GET would let any page on the internet log someone out with an image tag.

import { Button } from '@/components/ui'

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="quiet">
        Abmelden
      </Button>
    </form>
  )
}
