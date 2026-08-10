# frozen_string_literal: true

class ImportContactsJob < ApplicationJob
  queue_as :default

  def perform(contacts, company_id, user_id)
    Import::Contacts.call(contacts, company_id: company_id, user_id: user_id)
  rescue StandardError => e
    ExceptionNotifier.notify_exception(
      e,
      data: { payload: contacts }
    )
  end

end
