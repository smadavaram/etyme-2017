class CopyValuesFromCompanyCandidatesTable < ActiveRecord::Migration[4.2]
  Candidate.all.each do |c|
    if c.groups.present?
      c.groups.each do |cg|
        Groupable.create(groupable_type: "Candidate", groupable_id: "#{c.id}",group_id: cg.id)
      end
    end
  end
end
