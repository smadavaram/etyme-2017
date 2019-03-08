class CompanyContact < ApplicationRecord

  include DomainExtractor

  belongs_to :company, optional: true
  has_many :notifications, as: :notifiable, dependent: :destroy
  has_many :groupables ,as: :groupable
  has_many :groups ,through: :groupables

  # validates :email, uniqueness: { case_sensitive: false, scope: :company_id }, format: { with: EMAIL_REGEX }, presence: true

  scope :search_by ,->(term) { CompanyContact.where('lower(first_name) like :term or lower(last_name) like :term or title like :term ' ,{term: "%#{term.downcase}%" })}

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  def full_name
    self.first_name.to_s + " " + self.last_name.to_s
  end

  def photo
    super.present? ? super : 'avatars/m_sunny_big.png'
  end

end
