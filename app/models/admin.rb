class Admin < User

  #Associations
  belongs_to :company

  #Validation
  validates :password,presence: true,if: Proc.new { |consultant| !consultant.password.nil? }
  validates :password_confirmation,presence: true,if: Proc.new { |consultant| !consultant.password.nil? }

  # Nested Attributes
  accepts_nested_attributes_for :address , reject_if: :all_blank

  #CallBacks
  after_create :send_invitation

  private

  # Call after create
  def send_invitation
    invite! do |u|
      u.skip_invitation = true
    end
    UserMailer.invite_consultant(self).deliver
  end

end
