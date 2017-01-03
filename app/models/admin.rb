class Admin < User

  has_many          :job_invitations , as: :recipient

  validates         :password,presence: true,if: Proc.new { |consultant| !consultant.password.nil? }
  validates         :password_confirmation,presence: true,if: Proc.new { |consultant| !consultant.password.nil? }

  accepts_nested_attributes_for :address , reject_if: :all_blank

  after_create                  :send_invitation ,if: Proc.new { |admin| admin.company.present? }

  has_many          :invoices,class_name:"Invoice",:foreign_key => "submitted_by"

  private

  # Call after create
  def send_invitation
    invite! do |u|
      u.skip_invitation = true
    end
    UserMailer.invite_user(self).deliver
  end

end
