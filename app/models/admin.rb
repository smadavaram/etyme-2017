# frozen_string_literal: true

class Admin < User
  include DomainExtractor

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
end
