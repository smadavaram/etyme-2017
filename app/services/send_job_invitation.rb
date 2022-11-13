# frozen_string_literal: true

class SendJobInvitation

  # constructor
  def initialize(group_ids, invitation_params, current_company, current_user)
    @current_user = current_user
    @current_company = current_company
    @group_ids = group_ids
    @invitation_params = invitation_params
  end

  def send_bulk_invitations
    groups = Group.where(id: @group_ids)
    groups.each do |group|
      group.candidates.each do |candidate|
        @current_company.sent_job_invitations.create!(
          @invitation_params.merge!(created_by_id: @current_user.id, invitation_type: 'candidate',
                                    recipient_type: 'Candidate', recipient_id: candidate.id)
        )
      end
    end
  end

end
