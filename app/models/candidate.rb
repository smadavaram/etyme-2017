class Candidate < User

  #Callbacks
  after_create :send_welcome_email

  #Associations
  has_many :contracts , through: :job_applications,dependent: :destroy

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

end
