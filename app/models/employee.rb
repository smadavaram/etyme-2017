# == Schema Information
#
# Table name: devise
#
#  id                     :integer          not null, primary key
#  first_name             :string           default("")
#  last_name              :string           default("")
#  gender                 :boolean
#  email                  :string           default(""), not null
#  type                   :string
#  phone                  :string
#  country                :string
#  state                  :string
#  city                   :string
#  zip_code               :string
#  photo                  :string
#  status                 :boolean
#  encrypted_password     :string           default(""), not null
#  reset_password_token   :string
#  reset_password_sent_at :datetime
#  remember_created_at    :datetime
#  sign_in_count          :integer          default(0), not null
#  current_sign_in_at     :datetime
#  last_sign_in_at        :datetime
#  current_sign_in_ip     :string
#  last_sign_in_ip        :string
#  confirmation_token     :string
#  confirmed_at           :datetime
#  confirmation_sent_at   :datetime
#  unconfirmed_email      :string
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  company_id             :integer
#
# Indexes
#
#  index_users_on_confirmation_token    (confirmation_token) UNIQUE
#  index_users_on_email                 (email) UNIQUE
#  index_users_on_reset_password_token  (reset_password_token) UNIQUE
#

class Employee < User

  #Associations
  has_one    :employee_profile , dependent: :destroy
  belongs_to :company


  # Nested Attributes
  accepts_nested_attributes_for :employee_profile , allow_destroy: true

  #Validation
  validates :password,presence: true,if: Proc.new { |employee| !employee.password.nil? }
  validates :password_confirmation,presence: true,if: Proc.new { |employee| !employee.password.nil? }

  #CallBacks
  after_create :send_invitation

  private

  def send_invitation
    invite! do |u|
      u.skip_invitation = true
    end
    UserMailer.invite_employee(self).deliver
  end



end
