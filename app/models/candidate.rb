class Candidate < User

  #Callbacks
  after_create :send_welcome_email
  after_create :create_address

  #Associations
  has_many :contracts , through: :job_applications,dependent: :destroy

  #Tags Input
  # acts_as_taggable_on :skills


  def etyme_url
    ENV['domain']
  end


  private

  def create_address
    address=Address.new
    address.save(validate: false)
    self.primary_address_id = address.try(:id)
    self.save
  end

  # send welcome email to candidate
  def send_welcome_email
    CandidateMailer.welcome_candidate(self).deliver_now
  end

end
