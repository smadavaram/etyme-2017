# == Schema Information
#
# Table name: experiences
#
#  id           :integer          not null, primary key
#  title        :string
#  description  :text
#  company_name :string
#  start_date   :date
#  end_date     :date
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#

class Experience < ActiveRecord::Base
  belongs_to :candidate
end
