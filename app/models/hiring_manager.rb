class HiringManager < User

  #Association


  #Validations
  validates_confirmation_of :password
  validates_presence_of     :password, on: :create
  validates_length_of       :password, minimum: 6,message: "must be atleat 6 characters" ,if: Proc.new { |user| user.password.present? }

  # scope :job_invitations , -> { self.company.job_invitations }
  #
  def job_invitations
    self.company.job_invitations || []
  end
end
