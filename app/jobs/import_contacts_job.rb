# frozen_string_literal: true

class ImportContactsJob < ApplicationJob
  queue_as :h_contracts

  def perform(contacts)
    Import::Contacts.perform(contacts)
  rescue StandardError => e
    ExceptionNotifier.notify_exception(
      e,
      data: { payload: contacts }
    )
  end

end
