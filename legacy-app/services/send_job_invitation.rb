# frozen_string_literal: true

class SendJobInvitation
  # constructor
  def initialize(ids, invitation_params, current_company, group_ids)
    @group_ids = group_ids
    @current_company = current_company
    @ids = ids
    @invitation_params = invitation_params
  end

  def send_bulk_invitations
    case @invitation_params[:invitation_type]
    when 'vendor'
      contacts = []
      Company.vendor.where(id: @ids).each do |company|
        contacts << company.user_contacts
      end
      groups = Group.where(id: @group_ids)
      groups.each do |group|
        contacts << group.company_contacts
      end
      contacts.flatten.uniq.each do |user_contact|
        @current_company.sent_job_invitations.create!(@invitation_params.merge!(recipient_id: user_contact.user_id))
      end
    when 'candidate'
      candidates = []
      candidates << Candidate.where(id: @ids)
      groups = Group.where(id: @group_ids)
      groups.each do |group|
        candidates << group.candidates
      end
      candidates.flatten.uniq.each do |candidate|
        @current_company.sent_job_invitations.create!(@invitation_params.merge!(recipient_id: candidate.id))
      end
    end
  end
end
