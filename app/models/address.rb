class Address < ApplicationRecord

  has_many            :locations
  has_one             :user, foreign_key: :primary_address_id
  has_one             :candidate, foreign_key: :primary_address_id
  attr_accessor :address

  def address
    [address_1, address_2].compact.join(', ')
  end

  geocoded_by :address
  after_validation :geocode


  # validates           :address_1, :city, :country, presence: true, if: Proc.new{ |a| a.user.type != 'Candidate'}

  def full_address
    [self&.city, self&.state, self&.address_1, self&.zip_code.to_s].join(' ')
  end

end
