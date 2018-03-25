class Address < ActiveRecord::Base

  has_many            :locations
  has_one             :user, foreign_key: :primary_address_id
  has_one             :candidate, foreign_key: :primary_address_id


  # validates           :address_1, :city, :country, presence: true, if: Proc.new{ |a| a.user.type != 'Candidate'}

end
