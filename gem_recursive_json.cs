public void UpdateFilePaths(JToken node)
{
    if (node.Type == JTokenType.Object)
    {
        foreach (var child in node.Children<JProperty>())
        {
            // If we find an array that looks like a SurveyJS file list
            if (child.Value.Type == JTokenType.Array && child.Value.Any(x => x["content"] != null))
            {
                foreach (var fileObject in child.Value)
                {
                    string oldId = fileObject["content"].ToString();
                    fileObject["content"] = MoveToLongTermStorage(oldId); // Swap it!
                }
            }
            else
            {
                UpdateFilePaths(child.Value); // Keep digging
            }
        }
    }
}