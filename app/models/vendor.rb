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

class Vendor < User

  #Validations
  validates_confirmation_of :password
  validates_presence_of     :password, on: :create
  validates_length_of       :password, minimum: 6,message: "must be atleat 6 characters" ,if: Proc.new { |vendor| vendor.password.present? }

  # Association & Relations
  has_many :job_invitations , as: :recipient

end
