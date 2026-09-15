# == Schema Information
#
# Table name: rating_categories
#
#  id         :bigint           not null, primary key
#  name       :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class RatingCategory < ApplicationRecord
end
