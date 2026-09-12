# frozen_string_literal: true

# == Schema Information
#
# Table name: users
#
#  id                     :integer          not null, primary key
#  company_id             :integer
#  first_name             :string           default("")
#  last_name              :string           default("")
#  gender                 :integer
#  email                  :string           default(""), not null
#  type                   :string
#  phone                  :string
#  primary_address_id     :integer
#  photo                  :string
#  signature              :json
#  status                 :integer
#  dob                    :date
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
#  invitation_token       :string
#  invitation_created_at  :datetime
#  invitation_sent_at     :datetime
#  invitation_accepted_at :datetime
#  invitation_limit       :integer
#  invited_by_type        :string
#  invited_by_id          :integer
#  invitations_count      :integer          default(0)
#  skills                 :string
#  ssn                    :string
#  max_working_hours      :integer          default(28800)
#  time_zone              :string
#  candidate_id           :integer
#  deleted_at             :datetime
#  visa_status            :integer
#  availability           :date
#  relocation             :integer          default(0)
#  age                    :integer
#  video                  :string
#  resume                 :string
#  video_type             :string
#  chat_status            :string
#  temp_pass              :string
#  ancestry               :string
#  stripe_charge_id       :integer
#  paid                   :boolean
#  online                 :boolean          default(TRUE)
#  provider               :string
#  uid                    :string
#  online_user_status     :string
#
class Admin < User
  include DomainExtractor

  rating

  validates :password, presence: true, if: proc { |admin| !admin.password.nil? }
  validates :password_confirmation, presence: true, if: proc { |admin| !admin.password.nil? }

  has_many          :invoices, class_name: 'Invoice', foreign_key: 'submitted_by'
  has_many          :job_invitations, as: :recipient
  has_many          :csc_accounts, as: :accountable

  after_create :send_invitation, if: proc { |admin| admin.company.present? }
  validate :user_email_domain
  accepts_nested_attributes_for :address, reject_if: :all_blank

  # it should be public method
  def send_invitation
    invite! do |u|
      u.skip_invitation = true
    end
    UserMailer.invite_user(self).deliver
  end

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("%#{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  def full_name
    "#{first_name} #{last_name}"
  end

end
