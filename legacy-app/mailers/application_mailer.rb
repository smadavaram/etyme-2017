# frozen_string_literal: true

class ApplicationMailer < ActionMailer::Base
  # TODO: FIXME: we need to setup domain etyme.com in the mailcrux server
  default from: 'support@etyme.com'

  # layout 'mailer'
end
