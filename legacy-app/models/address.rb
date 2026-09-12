# frozen_string_literal: true

# == Schema Information
#
# Table name: addresses
#
#  id               :integer          not null, primary key
#  address_1        :string
#  address_2        :string
#  country          :string
#  city             :string
#  state            :string
#  zip_code         :string
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  from_date        :date
#  to_date          :date
#  addressable_type :string
#  addressable_id   :bigint
#  latitude         :float
#  longitude        :float
#
class Address < ApplicationRecord
  has_many            :locations
  has_one             :user, foreign_key: :primary_address_id
  has_one             :candidate, foreign_key: :primary_address_id

  def address
    [address_1, address_2].compact.join(', ')
  end
  geocoded_by :address
  after_validation :geocode
  scope :search_by, ->(term, _search_scop) { Company.where('lower(name) like :term or lower(description) like :term or lower(email) like :term or lower(phone) like :term', term: "#{term&.downcase}%") }

  # validates           :address_1, :city, :country, presence: true, if: Proc.new{ |a| a.user.type != 'Candidate'}

  def full_address
    [self&.city, self&.state, self&.address_1, self&.zip_code.to_s].join(' ')
  end
end
