class AddShareKeyToJobApplication < ActiveRecord::Migration
  def change
    add_column :job_applications, :share_key, :string
  end
end
