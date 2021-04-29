class AddRecruiterIdToCandidates < ActiveRecord::Migration[5.1]
  def change
    add_column  :candidates, :recruiter_id, :integer
    add_index   :candidates, :recruiter_id
  end
end
