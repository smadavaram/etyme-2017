class AddOnlineCandidateStatusToCandidates < ActiveRecord::Migration[5.2]
  def change
    add_column :candidates, :online_candidate_status, :string
  end
end
