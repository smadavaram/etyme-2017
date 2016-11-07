# == Schema Information
#
# Table name: educations
#
#  id         :integer          not null, primary key
#  title      :string
#  institute  :string
#  start_date :date
#  end_date   :date
#  created_at :datetime         not null
#  updated_at :datetime         not null
#

class Education < ActiveRecord::Base
  belongs_to :candidate
end
