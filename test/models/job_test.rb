# frozen_string_literal: true

# == Schema Information
#
# Table name: jobs
#
#  id                      :integer          not null, primary key
#  title                   :string
#  description             :text
#  location                :string
#  start_date              :date
#  end_date                :date
#  parent_job_id           :integer
#  company_id              :integer
#  created_by_id           :integer
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#  is_public               :boolean          default(TRUE)
#  job_category            :string
#  is_system_generated     :boolean          default(FALSE)
#  deleted_at              :datetime
#  video_file              :string
#  industry                :string
#  department              :string
#  price                   :decimal(, )
#  job_type                :string
#  ref_job_id              :integer
#  is_bench_job            :boolean
#  comp_video              :string
#  listing_type            :string           default("Job")
#  status                  :string
#  media_type              :string
#  conversation_id         :bigint
#  source                  :string
#  is_indexed              :boolean          default(FALSE)
#  files                   :text
#  latitude                :float
#  longitude               :float
#  created_by_candidate_id :integer
#
require 'test_helper'

class JobTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
