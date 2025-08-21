class AddUserIdToJobApplication < ActiveRecord::Migration[4.2]
  def change
    add_column :job_applications, :user_id, :integer
    add_column :job_applications, :job_id, :integer
  end
end
