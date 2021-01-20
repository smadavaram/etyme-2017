class AddCreatedByCandidateToJobs < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs, :created_by_candidate_id, :integer
  end
end
