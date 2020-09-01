# frozen_string_literal: true

class CompanyContact < ApplicationRecord
  include DomainExtractor

  belongs_to :company, foreign_key: 'company_id', class_name: 'Company'
  belongs_to :user_company, foreign_key: 'user_company_id', class_name: 'Company'
  has_many :notifications, as: :notifiable, dependent: :destroy
  has_many :groupables, as: :groupable
  has_many :groups, through: :groupables
  belongs_to :user
  belongs_to :created_by, class_name: 'User', foreign_key: :created_by_id
  has_many :contract_sell_business_details
  # TODO: remove this one too, when we remove the extra columns
  # validates :email, uniqueness: { case_sensitive: false, scope: :company_id }, format: { with: EMAIL_REGEX }, presence: true

  scope :search_by, ->(term) { CompanyContact.where('lower(first_name) like :term or lower(last_name) like :term or title like :term ', term: "%#{term.downcase}%") }

  scope :own_company, ->(email) { User.where('email IN (?)', email).first }

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  def full_name
    if user.present?
      user&.full_name
    else
      ""
    end
  end

  def photo
    user.photo
  end
end
