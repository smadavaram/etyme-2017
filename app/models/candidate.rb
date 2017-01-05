class Candidate < User

  after_create :send_welcome_email
  after_create :send_invitation    ,if: Proc.new{|candidate|candidate.invited_by.present?}
  after_create :send_job_invitation, if: Proc.new{ |candidate| candidate.invited_by.present?}

  attr_accessor :job_id
  attr_accessor :expiry
  attr_accessor :message
  attr_accessor :invitation_type

  has_many :contracts , through: :job_applications,dependent: :destroy
  has_many          :job_invitations , as: :recipient

  #Tags Input
  # acts_as_taggable_on :skills


  def etyme_url
    ENV['domain']
  end


  private

  # send welcome email to candidate
  def send_welcome_email
    CandidateMailer.welcome_candidate(self).deliver_now
  end

  def send_invitation
    invite! do |u|
      u.skip_invitation = true
    end
    CandidateMailer.invite_user(self,self.invited_by).deliver_now
  end

  def send_job_invitation
    self.invited_by.company.sent_job_invitations.create!( recipient:self , created_by:self.invited_by , job_id: self.job_id.to_i,message:self.message,expiry:self.expiry,invitation_type: self.invitation_type)
  end

end
