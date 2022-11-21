# frozen_string_literal: true

class SendJobInvitationsJob < ApplicationJob
  queue_as :default

  def perform(ids, invitation_params, current_company, group_ids)
    SendJobInvitation.new(ids, invitation_params, current_company, group_ids).send_bulk_invitations
  rescue StandardError => e
    ExceptionNotifier.notify_exception(
      e,
      data: { payload: contacts }
    )
  end
end
