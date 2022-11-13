# frozen_string_literal: true

class SendJobInvitationsJob < ApplicationJob
  queue_as :default

  def perform(group_ids, invitation_params, current_company, current_user)
    SendJobInvitation.new(group_ids, invitation_params, current_company, current_user).send_bulk_invitations
  rescue StandardError => e
    ExceptionNotifier.notify_exception(
      e,
      data: { payload: contacts }
    )
  end

end
